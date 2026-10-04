import { NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";
import {
  getAuthenticatedUser,
  validateGamePayload,
} from "@/lib/stageselect/api";
import type { Enums } from "@/lib/supabase/database.types";
import { getRecommendationDocumentFields } from "@/lib/stageselect/recommendations/semantic";

const feedbackActions = new Set<Enums<"stageselect_recommendation_action">>([
  "more_like_this",
  "not_for_me",
  "dismissed",
]);

export async function POST(request: Request) {
  const context = await getFeedbackContext(request);

  if (context instanceof Response) {
    return context;
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = payload.action;

    if (
      typeof action !== "string" ||
      !feedbackActions.has(
        action as Enums<"stageselect_recommendation_action">,
      )
    ) {
      throw new Error("Choose valid recommendation feedback.");
    }

    const { gameId, igdbId } = await resolveFeedbackGame(
      context.supabase,
      payload,
    );
    const recommendationId = payload.recommendationId
      ? getGameId(payload.recommendationId)
      : null;

    if (recommendationId) {
      const { data: impression, error: impressionError } = await context.supabase
        .from("stageselect_recommendation_impressions")
        .select("id")
        .eq("id", recommendationId)
        .eq("user_id", context.userId)
        .eq("game_id", gameId)
        .maybeSingle();

      if (impressionError || !impression) {
        throw new Error("The recommendation impression could not be found.");
      }
    }

    const { data, error } = await context.supabase
      .from("stageselect_recommendation_feedback")
      .insert({
        user_id: context.userId,
        game_id: gameId,
        recommendation_id: recommendationId,
        action: action as Enums<"stageselect_recommendation_action">,
      })
      .select("game_id, recommendation_id, action, created_at")
      .single();

    if (error || !data) {
      throw new Error(
        error?.message ??
          "Could not save feedback. Run the recommendation feedback migration.",
      );
    }

    if (recommendationId) {
      const { error: impressionError } = await context.supabase
        .from("stageselect_recommendation_impressions")
        .update({
          acted_at: new Date().toISOString(),
          action: action as Enums<"stageselect_recommendation_action">,
        })
        .eq("id", recommendationId)
        .eq("user_id", context.userId);

      if (impressionError) {
        throw new Error(impressionError.message);
      }
    }

    return NextResponse.json({ feedback: data, igdbId });
  } catch (error) {
    return feedbackError(error);
  }
}

export async function DELETE(request: Request) {
  const context = await getFeedbackContext(request);

  if (context instanceof Response) {
    return context;
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const gameId = getGameId(payload.gameId);
    const { error } = await context.supabase
      .from("stageselect_recommendation_feedback")
      .delete()
      .eq("user_id", context.userId)
      .eq("game_id", gameId);

    if (error) {
      throw new Error(
        error.message ||
          "Could not clear feedback. Run the recommendation feedback migration.",
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return feedbackError(error);
  }
}

async function getFeedbackContext(request: Request) {
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

    return { supabase, userId: user.id };
  } catch (error) {
    return feedbackError(error, 401);
  }
}

async function resolveFeedbackGame(
  supabase: NonNullable<ReturnType<typeof createRequestSupabaseClient>>,
  payload: Record<string, unknown>,
) {
  if (payload.game) {
    const game = validateGamePayload(payload.game);
    const recommendationDocument = await getRecommendationDocumentFields(game);
    const { data: existingGame } = await supabase
      .from("stageselect_games")
      .select("cover_url, cover_storage_path")
      .eq("igdb_id", game.igdbId)
      .maybeSingle();
    const { data, error } = await supabase
      .from("stageselect_games")
      .upsert(
        {
          igdb_id: game.igdbId,
          slug: game.slug ?? null,
          title: game.title,
          summary: game.summary ?? null,
          cover_url: existingGame?.cover_url ?? game.coverUrl ?? null,
          cover_storage_path: existingGame?.cover_storage_path ?? null,
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
          ...recommendationDocument,
          igdb_raw: game,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "igdb_id" },
      )
      .select("id, igdb_id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Could not cache this game.");
    }

    return { gameId: data.id, igdbId: data.igdb_id };
  }

  const gameId = getGameId(payload.gameId);
  const { data, error } = await supabase
    .from("stageselect_games")
    .select("id, igdb_id")
    .eq("id", gameId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("The recommended game could not be found.");
  }

  return { gameId: data.id, igdbId: data.igdb_id };
}

function getGameId(value: unknown) {
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

function feedbackError(error: unknown, status = 400) {
  const message =
    error instanceof Error ? error.message : "Could not update feedback.";

  return NextResponse.json({ error: message }, { status });
}
