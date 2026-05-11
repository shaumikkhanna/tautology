import { NextResponse } from "next/server";
import {
  createAdminSupabaseClient,
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";
import { cacheStageSelectCover } from "@/lib/stageselect/storage";
import {
  getAuthenticatedUser,
  isStageSelectStatus,
  stageselectReviewStatuses,
  validateGamePayload,
  validateRating,
} from "@/lib/stageselect/api";

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
    const payload = (await request.json()) as Record<string, unknown>;
    const user = await getAuthenticatedUser(supabase, accessToken);
    const game = validateGamePayload(payload.game);
    const status = payload.status;

    if (!isStageSelectStatus(status)) {
      throw new Error("Choose a valid status.");
    }

    const platform =
      typeof payload.platform === "string" ? payload.platform.trim() : "";

    if (stageselectReviewStatuses.has(status) && !platform) {
      throw new Error("Choose a platform before saving.");
    }

    const rating = validateRating(payload.rating);
    const review =
      typeof payload.review === "string" ? payload.review.trim() : "";
    const cachedCover = await cacheStageSelectCover(
      createAdminSupabaseClient(),
      {
        coverUrl: game.coverUrl,
        igdbId: game.igdbId,
      },
    );

    const { data: gameRow, error: gameError } = await supabase
      .from("stageselect_games")
      .upsert(
        {
          igdb_id: game.igdbId,
          slug: game.slug ?? null,
          title: game.title,
          summary: game.summary ?? null,
          cover_url: cachedCover?.coverUrl ?? game.coverUrl ?? null,
          cover_storage_path: cachedCover?.coverStoragePath ?? null,
          release_date: game.releaseYear ? `${game.releaseYear}-01-01` : null,
          platforms: game.platforms,
          genres: game.genres,
          igdb_raw: game,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "igdb_id" },
      )
      .select("id")
      .single();

    if (gameError || !gameRow) {
      throw new Error(
        gameError?.message ??
          "Could not cache this game. Run the game cache policy migration.",
      );
    }

    const { error: userGameError } = await supabase
      .from("stageselect_user_games")
      .upsert(
        {
          user_id: user.id,
          game_id: gameRow.id,
          status,
          platform: platform || "Unknown",
        },
        { onConflict: "user_id,game_id" },
      );

    if (userGameError) {
      throw new Error(userGameError.message);
    }

    const hasReviewData = rating !== null || Boolean(review);

    if (stageselectReviewStatuses.has(status) && hasReviewData) {
      const { error: reviewError } = await supabase
        .from("stageselect_reviews")
        .upsert(
          {
            user_id: user.id,
            game_id: gameRow.id,
            rating,
            body: review || null,
            visibility: "private",
          },
          { onConflict: "user_id,game_id" },
        );

      if (reviewError) {
        throw new Error(reviewError.message);
      }
    }

    if (!stageselectReviewStatuses.has(status)) {
      await supabase
        .from("stageselect_reviews")
        .delete()
        .eq("user_id", user.id)
        .eq("game_id", gameRow.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save this game.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
