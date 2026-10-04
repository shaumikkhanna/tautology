import type {
  IgdbGame,
  StageSelectDiscoverCandidate,
  StageSelectGameSearchResult,
} from "./types";
import {
  buildFacetFilter,
  buildFacetRetrievalQueries,
  mergeFacetCandidateResults,
  type FacetRetrievalQuery,
} from "../stageselect/recommendations/facetRetrieval.ts";

type IgdbTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

const discoverCache = new Map<
  string,
  { expiresAt: number; games: StageSelectDiscoverCandidate[] }
>();

const normalizedGameFields = [
  "id",
  "name",
  "slug",
  "summary",
  "first_release_date",
  "cover.url",
  "platforms.name",
  "genres.name",
  "themes.name",
  "keywords.name",
  "game_modes.name",
  "player_perspectives.name",
  "similar_games",
  "category",
  "game_type",
  "total_rating",
  "total_rating_count",
  "follows",
  "hypes",
].join(",");

const igdbClientId = process.env.IGDB_CLIENT_ID;
const igdbClientSecret = process.env.IGDB_CLIENT_SECRET;

export function hasIgdbConfig() {
  return Boolean(igdbClientId && igdbClientSecret);
}

export async function searchIgdbGames(query: string) {
  const accessToken = await getIgdbAccessToken();
  const body = [
    `search "${escapeApicalypseString(query)}";`,
    `fields ${normalizedGameFields};`,
    "where version_parent = null & themes != (42);",
    "limit 50;",
  ].join(" ");
  const games = await fetchIgdbGames(body, accessToken);

  return games
    .map(normalizeIgdbGame)
    .sort((a, b) => rankSearchResult(b, query) - rankSearchResult(a, query))
    .slice(0, 12);
}

export async function getIgdbDiscoverCandidates(
  seeds: Array<{ igdbId: number; title: string; weight: number }>,
) {
  const uniqueSeeds = Array.from(
    new Map(seeds.map((seed) => [seed.igdbId, seed])).values(),
  ).slice(0, 12);

  if (uniqueSeeds.length === 0) {
    return [];
  }

  const cacheKey = uniqueSeeds
    .map((seed) => `${seed.igdbId}:${seed.weight.toFixed(3)}`)
    .sort()
    .join(",");
  const cached = discoverCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.games;
  }

  const accessToken = await getIgdbAccessToken();
  const seedIds = uniqueSeeds.map((seed) => seed.igdbId);
  const seedRows = await fetchIgdbGames(
    [
      `fields ${normalizedGameFields};`,
      `where id = (${seedIds.join(",")});`,
      `limit ${seedIds.length};`,
    ].join(" "),
    accessToken,
  );
  const seedTitles = new Map(
    uniqueSeeds.map((seed) => [seed.igdbId, seed.title]),
  );
  const seedWeights = new Map(
    uniqueSeeds.map((seed) => [seed.igdbId, seed.weight]),
  );
  const relatedSeedsByCandidate = new Map<number, Set<string>>();

  for (const seed of seedRows) {
    if ((seedWeights.get(seed.id) ?? 0) <= 0) {
      continue;
    }

    for (const candidateId of seed.similar_games ?? []) {
      if (seedTitles.has(candidateId)) {
        continue;
      }

      const relatedTitles =
        relatedSeedsByCandidate.get(candidateId) ?? new Set<string>();
      const seedTitle = seedTitles.get(seed.id);

      if (seedTitle) {
        relatedTitles.add(seedTitle);
      }

      relatedSeedsByCandidate.set(candidateId, relatedTitles);
    }
  }

  const facetQueries = buildFacetRetrievalQueries(
    seedRows.map((seed) => ({
      ...seed,
      weight: seedWeights.get(seed.id) ?? 0,
    })),
  );
  const facetRowsByQuery = await fetchFacetCandidates(
    facetQueries,
    accessToken,
  );
  const {
    candidatesById: candidateRowsById,
    matchedFacetsByCandidate,
  } = mergeFacetCandidateResults(
    facetQueries,
    facetRowsByQuery,
    new Set(seedIds),
  );

  const relatedCandidateIds = Array.from(relatedSeedsByCandidate.keys())
    .filter((candidateId) => !seedTitles.has(candidateId))
    .filter((candidateId) => !candidateRowsById.has(candidateId))
    .slice(0, 80);

  if (relatedCandidateIds.length > 0) {
    const relatedRows = await fetchIgdbGames(
      [
        `fields ${normalizedGameFields};`,
        `where id = (${relatedCandidateIds.join(",")}) & version_parent = null & themes != (42);`,
        `limit ${relatedCandidateIds.length};`,
      ].join(" "),
      accessToken,
    );

    for (const game of relatedRows) {
      candidateRowsById.set(game.id, game);
    }
  }

  const games = Array.from(candidateRowsById.values())
    .map((game) => ({
      ...normalizeIgdbGame(game),
      relatedSeedTitles: Array.from(
        relatedSeedsByCandidate.get(game.id) ?? [],
      ).slice(0, 3),
      matchedPreferenceFacets: Array.from(
        matchedFacetsByCandidate.get(game.id) ?? [],
      ).slice(0, 4),
    }))
    .sort(
      (left, right) =>
        right.matchedPreferenceFacets.length -
          left.matchedPreferenceFacets.length ||
        right.relatedSeedTitles.length - left.relatedSeedTitles.length ||
        right.popularityScore - left.popularityScore,
    )
    .slice(0, 200);

  discoverCache.set(cacheKey, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    games,
  });

  return games;
}

async function fetchFacetCandidates(
  queries: FacetRetrievalQuery[],
  accessToken: string,
) {
  const results = new Map<string, IgdbGame[]>();

  if (queries.length === 0) {
    return results;
  }

  const body = queries
    .map(
      (query) => `query games "${query.key}" {
        fields ${normalizedGameFields};
        where ${buildFacetFilter(query)} & version_parent = null & themes != (42);
        sort total_rating_count desc;
        limit 30;
      };`,
    )
    .join("\n");

  try {
    const response = await fetchIgdbEndpoint<IgdbMultiQueryResult[]>(
      "multiquery",
      body,
      accessToken,
    );

    for (const item of response) {
      results.set(item.name, item.result ?? []);
    }
  } catch {
    // Related-game candidates still provide a useful fallback if facet
    // retrieval is temporarily unavailable.
  }

  return results;
}

type IgdbMultiQueryResult = {
  name: string;
  result?: IgdbGame[];
};

async function getIgdbAccessToken() {
  if (!igdbClientId || !igdbClientSecret) {
    throw new Error("Missing IGDB credentials.");
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
  tokenUrl.searchParams.set("client_id", igdbClientId);
  tokenUrl.searchParams.set("client_secret", igdbClientSecret);
  tokenUrl.searchParams.set("grant_type", "client_credentials");

  const response = await fetch(tokenUrl, {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`IGDB token request failed with status ${response.status}.`);
  }

  const token = (await response.json()) as IgdbTokenResponse;
  const refreshBufferMs = 60_000;

  cachedToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000 - refreshBufferMs,
  };

  return cachedToken.accessToken;
}

function normalizeIgdbGame(game: IgdbGame): StageSelectGameSearchResult {
  return {
    igdbId: game.id,
    title: game.name,
    slug: game.slug,
    summary: game.summary,
    coverUrl: normalizeCoverUrl(game.cover?.url),
    releaseYear: game.first_release_date
      ? new Date(game.first_release_date * 1000).getUTCFullYear()
      : undefined,
    platforms:
      game.platforms
        ?.map((platform) => platform.name)
        .filter((name): name is string => Boolean(name)) ?? [],
    genres:
      game.genres
        ?.map((genre) => genre.name)
        .filter((name): name is string => Boolean(name)) ?? [],
    themes: namesFromIgdbEntities(game.themes),
    keywords: namesFromIgdbEntities(game.keywords),
    gameModes: namesFromIgdbEntities(game.game_modes),
    playerPerspectives: namesFromIgdbEntities(game.player_perspectives),
    similarGameIgdbIds: game.similar_games ?? [],
    category: game.category,
    gameType: game.game_type,
    totalRating: game.total_rating,
    totalRatingCount: game.total_rating_count ?? 0,
    popularityScore:
      (game.total_rating_count ?? 0) * 10 +
      (game.follows ?? 0) +
      (game.hypes ?? 0),
  };
}

async function fetchIgdbGames(body: string, accessToken: string) {
  return fetchIgdbEndpoint<IgdbGame[]>("games", body, accessToken);
}

async function fetchIgdbEndpoint<T>(
  endpoint: "games" | "multiquery",
  body: string,
  accessToken: string,
) {
  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Client-ID": igdbClientId ?? "",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `IGDB ${endpoint} request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

function namesFromIgdbEntities(
  entities: Array<{ name?: string }> | undefined,
) {
  return (
    entities
      ?.map((entity) => entity.name)
      .filter((name): name is string => Boolean(name)) ?? []
  );
}

function rankSearchResult(game: StageSelectGameSearchResult, query: string) {
  const normalizedTitle = game.title.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const titleScore = normalizedTitle === normalizedQuery ? 5_000 : 0;
  const startsWithScore = normalizedTitle.startsWith(normalizedQuery)
    ? 2_500
    : 0;
  const mainGameScore = game.category === 0 ? 2_500 : 0;

  return titleScore + startsWithScore + mainGameScore + game.popularityScore;
}

function normalizeCoverUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  const absoluteUrl = url.startsWith("//") ? `https:${url}` : url;

  return absoluteUrl.replace("t_thumb", "t_cover_big");
}

function escapeApicalypseString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
