import type { IgdbGame, StageSelectGameSearchResult } from "./types";

type IgdbTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

const igdbClientId = process.env.IGDB_CLIENT_ID;
const igdbClientSecret = process.env.IGDB_CLIENT_SECRET;

export function hasIgdbConfig() {
  return Boolean(igdbClientId && igdbClientSecret);
}

export async function searchIgdbGames(query: string) {
  const accessToken = await getIgdbAccessToken();
  const body = [
    `search "${escapeApicalypseString(query)}";`,
    "fields id,name,slug,summary,first_release_date,cover.url,platforms.name,genres.name,category,total_rating_count,follows,hypes;",
    "where version_parent = null;",
    "limit 50;",
  ].join(" ");

  const response = await fetch("https://api.igdb.com/v4/games", {
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
    throw new Error(`IGDB search failed with status ${response.status}.`);
  }

  const games = (await response.json()) as IgdbGame[];

  return games
    .map(normalizeIgdbGame)
    .sort((a, b) => rankSearchResult(b, query) - rankSearchResult(a, query))
    .slice(0, 12);
}

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
    category: game.category,
    popularityScore:
      (game.total_rating_count ?? 0) * 10 +
      (game.follows ?? 0) +
      (game.hypes ?? 0),
  };
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
