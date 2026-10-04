import { NextResponse } from "next/server";
import {
  getIgdbDiscoverCandidates,
  hasIgdbConfig,
} from "@/lib/igdb/client";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/stageselect/api";
import {
  getLatestFeedbackByGame,
  getPreferenceWeight,
  type RecommendationFeedback,
  type RecommendationGame,
} from "@/lib/stageselect/recommendations";

type LibraryRow = Pick<
  Tables<"stageselect_user_games">,
  "game_id" | "status" | "platform"
> & {
  stageselect_games: Pick<
    Tables<"stageselect_games">,
    | "igdb_id"
    | "title"
    | "genres"
    | "themes"
    | "keywords"
    | "game_modes"
    | "player_perspectives"
    | "release_date"
  > | null;
};

type FeedbackRow = Pick<
  Tables<"stageselect_recommendation_feedback">,
  "game_id" | "action" | "created_at"
> & {
  stageselect_games: Pick<
    Tables<"stageselect_games">,
    "igdb_id" | "title"
  > | null;
};

export async function GET(request: Request) {
  if (!hasServerSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  if (!hasIgdbConfig()) {
    return NextResponse.json(
      { error: "IGDB is not configured." },
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
    const [libraryResponse, reviewsResponse, feedbackResponse] =
      await Promise.all([
        supabase
          .from("stageselect_user_games")
          .select(
            "game_id, status, platform, stageselect_games(igdb_id, title, genres, themes, keywords, game_modes, player_perspectives, release_date)",
          )
          .eq("user_id", user.id),
        supabase
          .from("stageselect_reviews")
          .select("game_id, rating")
          .eq("user_id", user.id),
        supabase
          .from("stageselect_recommendation_feedback")
          .select(
            "game_id, action, created_at, stageselect_games(igdb_id, title)",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

    if (libraryResponse.error) {
      throw new Error(libraryResponse.error.message);
    }

    if (reviewsResponse.error) {
      throw new Error(reviewsResponse.error.message);
    }

    if (feedbackResponse.error) {
      throw new Error(feedbackResponse.error.message);
    }

    const library = (libraryResponse.data ?? []) as unknown as LibraryRow[];

    if (library.length === 0) {
      return NextResponse.json({ candidates: [], reason: "empty_library" });
    }

    const ratings = new Map(
      (reviewsResponse.data ?? []).map((review) => [
        review.game_id,
        review.rating,
      ]),
    );
    const feedbackRows = (feedbackResponse.data ?? []) as unknown as FeedbackRow[];
    const feedback: RecommendationFeedback[] = feedbackRows.map((item) => ({
        gameId: item.game_id,
        igdbId: item.stageselect_games?.igdb_id,
        action: item.action,
        createdAt: item.created_at,
      }));
    const feedbackByGame = getLatestFeedbackByGame(feedback);
    const weightedSeeds = library
      .filter((item) => item.stageselect_games)
      .map((item) => {
        const game = item.stageselect_games!;
        const recommendationGame: RecommendationGame = {
          id: item.game_id,
          title: game.title,
          status: item.status,
          platform: item.platform,
          genres: jsonToStringArray(game.genres),
          themes: jsonToStringArray(game.themes),
          keywords: jsonToStringArray(game.keywords),
          gameModes: jsonToStringArray(game.game_modes),
          playerPerspectives: jsonToStringArray(game.player_perspectives),
          rating: ratings.get(item.game_id) ?? null,
          releaseYear: game.release_date
            ? Number(game.release_date.slice(0, 4))
            : null,
        };
        const directAction = feedbackByGame.get(item.game_id)?.action;
        const directWeight =
          directAction === "more_like_this"
            ? 2
            : directAction === "not_for_me"
              ? -2
              : 0;

        return {
          igdbId: game.igdb_id,
          title: game.title,
          weight: getPreferenceWeight(recommendationGame) + directWeight,
        };
      });
    const libraryGameIds = new Set(library.map((item) => item.game_id));
    const outsideFeedbackSeeds = Array.from(feedbackByGame.values()).flatMap(
      (item) => {
        if (libraryGameIds.has(item.gameId)) {
          return [];
        }

        const row = feedbackRows.find(
          (candidate) =>
            candidate.game_id === item.gameId &&
            candidate.created_at === item.createdAt,
        );
        const game = row?.stageselect_games;
        const weight =
          item.action === "more_like_this"
            ? 2
            : item.action === "not_for_me"
              ? -2
              : 0;

        return game && weight !== 0
          ? [{ igdbId: game.igdb_id, title: game.title, weight }]
          : [];
      },
    );
    const allWeightedSeeds = [...weightedSeeds, ...outsideFeedbackSeeds];
    const positiveSeeds = allWeightedSeeds
      .filter((seed) => seed.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
    const negativeEvidence = allWeightedSeeds
      .filter((seed) => seed.weight < 0)
      .sort((a, b) => a.weight - b.weight)
      .slice(0, 4);
    const hasAnyWeightedSignal = allWeightedSeeds.some(
      (seed) => seed.weight !== 0,
    );
    const fallbackSeeds = hasAnyWeightedSignal
      ? []
      : allWeightedSeeds.slice(0, Math.min(4, allWeightedSeeds.length)).map(
          (seed) => ({ ...seed, weight: 0.25 }),
        );
    const seeds = [...positiveSeeds, ...negativeEvidence, ...fallbackSeeds];

    if (positiveSeeds.length === 0 && fallbackSeeds.length === 0) {
      return NextResponse.json({
        candidates: [],
        reason: "no_positive_signals",
      });
    }

    const candidates = await getIgdbDiscoverCandidates(seeds);
    const libraryIgdbIds = new Set(
      library.flatMap((item) =>
        item.stageselect_games ? [item.stageselect_games.igdb_id] : [],
      ),
    );
    const eligibleCandidates = candidates.filter(
      (candidate) => !libraryIgdbIds.has(candidate.igdbId),
    );
    const { data: semanticRows } = await supabase.rpc(
      "get_stageselect_semantic_scores",
      {
        candidate_game_ids: [],
        candidate_igdb_ids: eligibleCandidates.map(
          (candidate) => candidate.igdbId,
        ),
      },
    );
    const semanticByIgdbId = new Map(
      (semanticRows ?? []).map((row) => [row.igdb_id, row]),
    );

    return NextResponse.json({
      candidates: eligibleCandidates.map((candidate) => {
        const semantic = semanticByIgdbId.get(candidate.igdbId);

        return semantic
          ? {
              ...candidate,
              semanticPositiveSimilarity: semantic.positive_similarity,
              semanticNegativeSimilarity: semantic.negative_similarity,
              semanticSignalCount:
                semantic.positive_signal_count +
                semantic.negative_signal_count,
            }
          : candidate;
      }),
      seedCount: positiveSeeds.length || fallbackSeeds.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not load discovery candidates.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function jsonToStringArray(value: Json) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
