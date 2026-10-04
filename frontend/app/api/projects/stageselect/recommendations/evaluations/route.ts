import { NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/stageselect/api";
import {
  buildBlindRankingComparison,
  globalProfileVariant,
  multiInterestVariant,
  recommendationVersions,
  type BlindRankingVariant,
} from "@/lib/stageselect/recommendations";

const variants = new Set<BlindRankingVariant>([
  globalProfileVariant,
  multiInterestVariant,
]);

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
    const payload = validatePayload(
      (await request.json()) as Record<string, unknown>,
    );
    const { data, error } = await supabase
      .from("stageselect_ranking_evaluations")
      .upsert(
        {
          user_id: user.id,
          surface: "discover",
          model_version: recommendationVersions.model,
          baseline_variant: globalProfileVariant,
          candidate_variant: multiInterestVariant,
          controls: payload.controls,
          candidate_count: payload.candidateCount,
          comparison_key: payload.comparisonKey,
          left_variant: payload.leftVariant,
          right_variant: payload.rightVariant,
          left_game_igdb_ids: payload.leftGameIgdbIds,
          right_game_igdb_ids: payload.rightGameIgdbIds,
          choice: payload.choice,
        },
        { onConflict: "user_id,comparison_key" },
      )
      .select("id, choice, updated_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Could not save the ranking comparison.");
    }

    return NextResponse.json({ evaluation: data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not save the ranking comparison.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function validatePayload(payload: Record<string, unknown>) {
  const comparisonKey = payload.comparisonKey;
  const leftVariant = validateVariant(payload.leftVariant);
  const rightVariant = validateVariant(payload.rightVariant);
  const leftGameIgdbIds = validateGameIds(payload.leftGameIgdbIds);
  const rightGameIgdbIds = validateGameIds(payload.rightGameIgdbIds);
  const choice = payload.choice;
  const candidateCount = payload.candidateCount;
  const controls = validateControls(payload.controls);

  if (
    typeof comparisonKey !== "string" ||
    !/^blind-v1-[0-9a-f]{8}$/.test(comparisonKey)
  ) {
    throw new Error("Ranking comparison key is invalid.");
  }

  if (leftVariant === rightVariant) {
    throw new Error("Ranking comparison variants must differ.");
  }

  if (choice !== "left" && choice !== "right" && choice !== "tie") {
    throw new Error("Choose the left list, right list, or a tie.");
  }

  if (
    typeof candidateCount !== "number" ||
    !Number.isInteger(candidateCount) ||
    candidateCount < Math.max(leftGameIgdbIds.length, rightGameIgdbIds.length) ||
    candidateCount > 1_000
  ) {
    throw new Error("Ranking comparison candidate count is invalid.");
  }

  const globalProfileIds =
    leftVariant === globalProfileVariant
      ? leftGameIgdbIds
      : rightGameIgdbIds;
  const multiInterestIds =
    leftVariant === multiInterestVariant
      ? leftGameIgdbIds
      : rightGameIgdbIds;
  const expectedComparison = buildBlindRankingComparison(
    globalProfileIds.map((igdbId) => ({ igdbId, title: String(igdbId) })),
    multiInterestIds.map((igdbId) => ({ igdbId, title: String(igdbId) })),
    controls,
  );

  if (
    !expectedComparison ||
    expectedComparison.comparisonKey !== comparisonKey ||
    expectedComparison.leftVariant !== leftVariant ||
    expectedComparison.rightVariant !== rightVariant
  ) {
    throw new Error("Ranking comparison assignment is invalid.");
  }

  return {
    comparisonKey,
    leftVariant,
    rightVariant,
    leftGameIgdbIds,
    rightGameIgdbIds,
    choice,
    candidateCount,
    controls,
  };
}

function validateVariant(value: unknown): BlindRankingVariant {
  if (typeof value !== "string" || !variants.has(value as BlindRankingVariant)) {
    throw new Error("Ranking comparison variant is invalid.");
  }

  return value as BlindRankingVariant;
}

function validateGameIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw new Error("Ranking comparison games are invalid.");
  }

  const ids = value.map((item) => {
    if (typeof item !== "number" || !Number.isInteger(item) || item <= 0) {
      throw new Error("Ranking comparison game id is invalid.");
    }

    return item;
  });

  if (new Set(ids).size !== ids.length) {
    throw new Error("Ranking comparison games must be unique.");
  }

  return ids;
}

function validateControls(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Ranking comparison controls are required.");
  }

  const controls = value as Record<string, unknown>;

  if (
    controls.adventure !== 0 &&
    controls.adventure !== 50 &&
    controls.adventure !== 100
  ) {
    throw new Error("Ranking comparison variety level is invalid.");
  }

  if (
    typeof controls.platform !== "string" ||
    controls.platform.length < 1 ||
    controls.platform.length > 100
  ) {
    throw new Error("Ranking comparison platform is invalid.");
  }

  return {
    adventure: controls.adventure,
    platform: controls.platform,
  };
}
