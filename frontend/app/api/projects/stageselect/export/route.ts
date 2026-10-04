import { NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { getAuthenticatedUser } from "@/lib/stageselect/api";

type ExportLibraryRow = Pick<
  Tables<"stageselect_user_games">,
  | "game_id"
  | "status"
  | "platform"
  | "started_at"
  | "finished_at"
  | "created_at"
  | "updated_at"
> & {
  stageselect_games: Pick<Tables<"stageselect_games">, "igdb_id"> | null;
};

type ExportReviewRow = Pick<
  Tables<"stageselect_reviews">,
  "game_id" | "rating" | "body" | "visibility" | "created_at" | "updated_at"
>;

type ExportFeedbackRow = Pick<
  Tables<"stageselect_recommendation_feedback">,
  "recommendation_id" | "action" | "created_at"
> & {
  stageselect_games: Pick<Tables<"stageselect_games">, "igdb_id"> | null;
};

type ExportRunRow = Pick<
  Tables<"stageselect_recommendation_runs">,
  | "id"
  | "model_version"
  | "feature_schema_version"
  | "candidate_generation_version"
  | "surface"
  | "controls"
  | "candidate_count"
  | "generated_at"
>;

type ExportImpressionRow = Pick<
  Tables<"stageselect_recommendation_impressions">,
  | "id"
  | "run_id"
  | "rank"
  | "candidate_source"
  | "final_score"
  | "score_components"
  | "explanation_evidence"
  | "shown_at"
  | "acted_at"
  | "action"
> & {
  stageselect_games: Pick<Tables<"stageselect_games">, "igdb_id"> | null;
};

type ExportRankingEvaluationRow = Pick<
  Tables<"stageselect_ranking_evaluations">,
  | "model_version"
  | "surface"
  | "baseline_variant"
  | "candidate_variant"
  | "controls"
  | "candidate_count"
  | "comparison_key"
  | "left_variant"
  | "right_variant"
  | "left_game_igdb_ids"
  | "right_game_igdb_ids"
  | "choice"
  | "created_at"
  | "updated_at"
>;

type ExportOutcomeRow = Pick<
  Tables<"stageselect_recommendation_outcomes">,
  | "impression_id"
  | "outcome"
  | "rating"
  | "attribution_method"
  | "occurred_at"
> & {
  stageselect_games: Pick<Tables<"stageselect_games">, "igdb_id"> | null;
};

export async function GET(request: Request) {
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

    const { data: library, error: libraryError } = await supabase
      .from("stageselect_user_games")
      .select(
        [
          "game_id",
          "status",
          "platform",
          "started_at",
          "finished_at",
          "created_at",
          "updated_at",
          "stageselect_games(igdb_id)",
        ].join(", "),
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (libraryError) {
      throw new Error(libraryError.message);
    }

    const exportedAt = new Date().toISOString();
    const libraryRows = (library ?? []) as unknown as ExportLibraryRow[];
    const gameIds = libraryRows.map((item) => item.game_id);
    let reviews: ExportReviewRow[] = [];

    if (gameIds.length > 0) {
      const { data: reviewData, error: reviewsError } = await supabase
        .from("stageselect_reviews")
        .select("game_id, rating, body, visibility, created_at, updated_at")
        .eq("user_id", user.id)
        .in("game_id", gameIds);

      if (reviewsError) {
        throw new Error(reviewsError.message);
      }

      reviews = (reviewData ?? []) as ExportReviewRow[];
    }

    const reviewsByGame = new Map(
      reviews.map((review) => [review.game_id, review]),
    );
    const { data: feedbackData, error: feedbackError } = await supabase
      .from("stageselect_recommendation_feedback")
      .select(
        "recommendation_id, action, created_at, stageselect_games(igdb_id)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (feedbackError) {
      throw new Error(feedbackError.message);
    }

    const feedbackRows = (feedbackData ?? []) as unknown as ExportFeedbackRow[];
    const [
      runsResponse,
      impressionsResponse,
      evaluationsResponse,
      outcomesResponse,
    ] =
      await Promise.all([
        supabase
          .from("stageselect_recommendation_runs")
          .select(
            "id, model_version, feature_schema_version, candidate_generation_version, surface, controls, candidate_count, generated_at",
          )
          .eq("user_id", user.id)
          .order("generated_at", { ascending: true }),
        supabase
          .from("stageselect_recommendation_impressions")
          .select(
            "id, run_id, rank, candidate_source, final_score, score_components, explanation_evidence, shown_at, acted_at, action, stageselect_games(igdb_id)",
          )
          .eq("user_id", user.id)
          .order("shown_at", { ascending: true }),
        supabase
          .from("stageselect_ranking_evaluations")
          .select(
            "model_version, surface, baseline_variant, candidate_variant, controls, candidate_count, comparison_key, left_variant, right_variant, left_game_igdb_ids, right_game_igdb_ids, choice, created_at, updated_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("stageselect_recommendation_outcomes")
          .select(
            "impression_id, outcome, rating, attribution_method, occurred_at, stageselect_games(igdb_id)",
          )
          .eq("user_id", user.id)
          .order("occurred_at", { ascending: true }),
      ]);

    if (runsResponse.error) {
      throw new Error(runsResponse.error.message);
    }

    if (impressionsResponse.error) {
      throw new Error(impressionsResponse.error.message);
    }

    if (evaluationsResponse.error) {
      throw new Error(evaluationsResponse.error.message);
    }

    if (outcomesResponse.error) {
      throw new Error(outcomesResponse.error.message);
    }

    const runRows = (runsResponse.data ?? []) as ExportRunRow[];
    const impressionRows = (impressionsResponse.data ??
      []) as unknown as ExportImpressionRow[];
    const rankingEvaluations = (evaluationsResponse.data ??
      []) as ExportRankingEvaluationRow[];
    const recommendationOutcomes = (outcomesResponse.data ??
      []) as unknown as ExportOutcomeRow[];
    const impressionsByRun = new Map<string, ExportImpressionRow[]>();

    for (const impression of impressionRows) {
      const items = impressionsByRun.get(impression.run_id) ?? [];
      items.push(impression);
      impressionsByRun.set(impression.run_id, items);
    }
    const games = libraryRows.map((item) => {
      const review = reviewsByGame.get(item.game_id);

      return {
        igdbId: item.stageselect_games?.igdb_id ?? null,
        status: item.status,
        platform: item.platform,
        startedAt: item.started_at,
        finishedAt: item.finished_at,
        addedAt: item.created_at,
        updatedAt: item.updated_at,
        review: review
          ? {
              rating: review.rating,
              body: review.body,
              visibility: review.visibility,
              createdAt: review.created_at,
              updatedAt: review.updated_at,
            }
          : null,
      };
    });
    const body = JSON.stringify(
      {
        exportedAt,
        games,
        recommendationFeedback: feedbackRows.map((item) => ({
          igdbId: item.stageselect_games?.igdb_id ?? null,
          recommendationId: item.recommendation_id,
          action: item.action,
          createdAt: item.created_at,
        })),
        recommendationRuns: runRows.map((run) => ({
          id: run.id,
          modelVersion: run.model_version,
          featureSchemaVersion: run.feature_schema_version,
          candidateGenerationVersion: run.candidate_generation_version,
          surface: run.surface,
          controls: run.controls,
          candidateCount: run.candidate_count,
          generatedAt: run.generated_at,
          impressions: (impressionsByRun.get(run.id) ?? []).map(
            (impression) => ({
              id: impression.id,
              igdbId: impression.stageselect_games?.igdb_id ?? null,
              rank: impression.rank,
              candidateSource: impression.candidate_source,
              finalScore: impression.final_score,
              scoreComponents: impression.score_components,
              explanationEvidence: impression.explanation_evidence,
              shownAt: impression.shown_at,
              actedAt: impression.acted_at,
              action: impression.action,
            }),
          ),
        })),
        rankingEvaluations: rankingEvaluations.map((evaluation) => ({
          modelVersion: evaluation.model_version,
          surface: evaluation.surface,
          baselineVariant: evaluation.baseline_variant,
          candidateVariant: evaluation.candidate_variant,
          controls: evaluation.controls,
          candidateCount: evaluation.candidate_count,
          comparisonKey: evaluation.comparison_key,
          leftVariant: evaluation.left_variant,
          rightVariant: evaluation.right_variant,
          leftGameIgdbIds: evaluation.left_game_igdb_ids,
          rightGameIgdbIds: evaluation.right_game_igdb_ids,
          choice: evaluation.choice,
          createdAt: evaluation.created_at,
          updatedAt: evaluation.updated_at,
        })),
        recommendationOutcomes: recommendationOutcomes.map((outcome) => ({
          impressionId: outcome.impression_id,
          igdbId: outcome.stageselect_games?.igdb_id ?? null,
          outcome: outcome.outcome,
          rating: outcome.rating,
          attributionMethod: outcome.attribution_method,
          occurredAt: outcome.occurred_at,
        })),
      },
      null,
      2,
    );

    return new Response(body, {
      headers: {
        "Content-Disposition": `attachment; filename="stageselect-export-${exportedAt.slice(0, 10)}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not export your data.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
