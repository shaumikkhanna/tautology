import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  getAuthenticatedUser,
  validateGamePayload,
} from "@/lib/stageselect/api";
import { recommendationVersions } from "@/lib/stageselect/recommendations";
import { getRecommendationDocumentFields } from "@/lib/stageselect/recommendations/semantic";
import type { StageSelectGameSearchResult } from "@/lib/igdb/types";

const maxImpressions = 24;
const candidateSources = new Set([
  "library_queue",
  "similar_games",
  "preference_facets",
  "similar_games+preference_facets",
  "related_fallback",
]);

type RunItem = {
  clientKey: string;
  gameId?: string;
  game?: StageSelectGameSearchResult;
  rank: number;
  candidateSource: string;
  finalScore: number;
  scoreComponents: Record<string, number>;
  evidence: {
    explanations: string[];
    matchedPreferenceFacets: string[];
    relatedSeedTitles: string[];
    tasteCluster: {
      id: string;
      label: string;
      supportingGames: string[];
    } | null;
  };
};

export async function POST(request: Request) {
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Log in first." }, { status: 401 });
  }

  const supabase = createRequestSupabaseClient(accessToken);

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  try {
    const user = await getAuthenticatedUser(supabase, accessToken);
    const payload = (await request.json()) as Record<string, unknown>;
    const surface = validateSurface(payload.surface);
    const controls = validateControls(payload.controls);
    const items = validateItems(payload.items, surface);
    const candidateCount = validateCandidateCount(
      payload.candidateCount,
      items.length,
    );
    const gameIdsByClientKey =
      surface === "play_next"
        ? await resolveLibraryGameIds(supabase, user.id, items)
        : await cacheDiscoverGames(supabase, items);
    const { data: run, error: runError } = await supabase
      .from("stageselect_recommendation_runs")
      .insert({
        user_id: user.id,
        model_version: recommendationVersions.model,
        feature_schema_version: recommendationVersions.featureSchema,
        candidate_generation_version:
          recommendationVersions.candidateGeneration,
        surface,
        controls,
        candidate_count: candidateCount,
      })
      .select("id")
      .single();

    if (runError || !run) {
      throw new Error(
        runError?.message ?? "Could not create recommendation run.",
      );
    }

    const { data: impressions, error: impressionError } = await supabase
      .from("stageselect_recommendation_impressions")
      .insert(
        items.map((item) => ({
          run_id: run.id,
          user_id: user.id,
          game_id: gameIdsByClientKey.get(item.clientKey)!,
          rank: item.rank,
          candidate_source: item.candidateSource,
          final_score: item.finalScore,
          score_components: item.scoreComponents,
          explanation_evidence: item.evidence,
        })),
      )
      .select("id, game_id, rank");

    if (impressionError || !impressions) {
      await supabase
        .from("stageselect_recommendation_runs")
        .delete()
        .eq("id", run.id)
        .eq("user_id", user.id);
      throw new Error(
        impressionError?.message ?? "Could not record recommendation impressions.",
      );
    }

    const clientKeyByRank = new Map(
      items.map((item) => [item.rank, item.clientKey]),
    );

    return NextResponse.json({
      runId: run.id,
      impressions: impressions.map((impression) => ({
        id: impression.id,
        clientKey: clientKeyByRank.get(impression.rank),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not record recommendation run.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function validateSurface(value: unknown) {
  if (value !== "play_next" && value !== "discover") {
    throw new Error("Choose a valid recommendation surface.");
  }

  return value;
}

function validateControls(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Recommendation controls are required.");
  }

  const controls = value as Record<string, unknown>;
  const adventure = controls.adventure;
  const platform = controls.platform;

  if (adventure !== 0 && adventure !== 50 && adventure !== 100) {
    throw new Error("Choose a valid recommendation variety level.");
  }

  if (
    typeof platform !== "string" ||
    platform.length === 0 ||
    platform.length > 100
  ) {
    throw new Error("Choose a valid recommendation platform.");
  }

  return { adventure, platform } satisfies Json;
}

function validateCandidateCount(value: unknown, impressionCount: number) {
  if (
    !Number.isInteger(value) ||
    typeof value !== "number" ||
    value < impressionCount ||
    value > 1_000
  ) {
    throw new Error("Candidate count is invalid.");
  }

  return value;
}

function validateItems(value: unknown, surface: "play_next" | "discover") {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxImpressions) {
    throw new Error("Recommendation impressions are invalid.");
  }

  const ranks = new Set<number>();
  const clientKeys = new Set<string>();

  return value.map((rawItem, index): RunItem => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new Error("Recommendation impression is invalid.");
    }

    const item = rawItem as Record<string, unknown>;
    const clientKey = validateShortString(item.clientKey, "client key", 100);
    const rank = item.rank;
    const candidateSource = validateShortString(
      item.candidateSource,
      "candidate source",
      80,
    );
    const finalScore = validateScore(item.finalScore, "final score");

    if (
      !Number.isInteger(rank) ||
      typeof rank !== "number" ||
      rank !== index + 1 ||
      ranks.has(rank)
    ) {
      throw new Error("Recommendation ranks must be unique and ordered.");
    }

    if (clientKeys.has(clientKey)) {
      throw new Error("Recommendation client keys must be unique.");
    }

    if (!candidateSources.has(candidateSource)) {
      throw new Error("Recommendation candidate source is invalid.");
    }

    ranks.add(rank);
    clientKeys.add(clientKey);

    return {
      clientKey,
      gameId:
        surface === "play_next" ? validateUuid(item.gameId) : undefined,
      game:
        surface === "discover" ? validateGamePayload(item.game) : undefined,
      rank,
      candidateSource,
      finalScore,
      scoreComponents: validateScoreComponents(item.scoreComponents),
      evidence: validateEvidence(item.evidence),
    };
  });
}

function validateScoreComponents(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Score components are required.");
  }

  const allowed = [
    "genre",
    "facets",
    "clusterAffinity",
    "intent",
    "platform",
    "quality",
    "semantic",
    "semanticNegative",
    "semanticCoverage",
    "relevance",
  ];
  const input = value as Record<string, unknown>;

  return Object.fromEntries(
    allowed.map((key) => [key, validateScore(input[key], key)]),
  );
}

function validateEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Explanation evidence is required.");
  }

  const evidence = value as Record<string, unknown>;

  return {
    explanations: validateStringArray(evidence.explanations, 3, 300),
    matchedPreferenceFacets: validateStringArray(
      evidence.matchedPreferenceFacets,
      6,
      100,
    ),
    relatedSeedTitles: validateStringArray(
      evidence.relatedSeedTitles,
      3,
      200,
    ),
    tasteCluster: validateTasteCluster(evidence.tasteCluster),
  };
}

function validateTasteCluster(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Taste-cluster evidence is invalid.");
  }

  const cluster = value as Record<string, unknown>;

  return {
    id: validateShortString(cluster.id, "taste cluster id", 100),
    label: validateShortString(cluster.label, "taste cluster label", 200),
    supportingGames: validateStringArray(cluster.supportingGames, 3, 200),
  };
}

async function resolveLibraryGameIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  items: RunItem[],
) {
  const requestedIds = items.map((item) => item.gameId!);
  const { data, error } = await supabase
    .from("stageselect_user_games")
    .select("game_id")
    .eq("user_id", userId)
    .in("game_id", requestedIds);

  if (error) {
    throw new Error(error.message);
  }

  const allowedIds = new Set((data ?? []).map((item) => item.game_id));

  if (requestedIds.some((gameId) => !allowedIds.has(gameId))) {
    throw new Error("A Play Next impression is not in this library.");
  }

  return new Map(items.map((item) => [item.clientKey, item.gameId!]));
}

async function cacheDiscoverGames(
  supabase: SupabaseClient<Database>,
  items: RunItem[],
) {
  const games = items.map((item) => item.game!);
  const recommendationDocuments = await Promise.all(
    games.map((game) => getRecommendationDocumentFields(game)),
  );
  const { data, error } = await supabase
    .from("stageselect_games")
    .upsert(
      games.map((game, index) => ({
        igdb_id: game.igdbId,
        slug: game.slug ?? null,
        title: game.title,
        summary: game.summary ?? null,
        release_date: game.releaseYear ? `${game.releaseYear}-01-01` : null,
        platforms: game.platforms,
        genres: game.genres,
        themes: game.themes,
        keywords: game.keywords,
        game_modes: game.gameModes,
        player_perspectives: game.playerPerspectives,
        similar_game_igdb_ids: game.similarGameIgdbIds,
        total_rating: game.totalRating ?? null,
        total_rating_count: game.totalRatingCount,
        game_type: game.gameType ?? null,
        ...recommendationDocuments[index],
        igdb_raw: game,
        last_synced_at: new Date().toISOString(),
      })),
      { onConflict: "igdb_id" },
    )
    .select("id, igdb_id");

  if (error || !data || data.length !== games.length) {
    throw new Error(error?.message ?? "Could not cache recommendation games.");
  }

  const idByIgdbId = new Map(data.map((game) => [game.igdb_id, game.id]));

  return new Map(
    items.map((item) => [
      item.clientKey,
      idByIgdbId.get(item.game!.igdbId)!,
    ]),
  );
}

function validateScore(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${label} must be between 0 and 1.`);
  }

  return value;
}

function validateShortString(value: unknown, label: string, max: number) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max
  ) {
    throw new Error(`Recommendation ${label} is invalid.`);
  }

  return value;
}

function validateStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error("Recommendation evidence is invalid.");
  }

  return value.map((item) =>
    validateShortString(item, "evidence", maxLength),
  );
}

function validateUuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error("A valid game id is required.");
  }

  return value;
}
