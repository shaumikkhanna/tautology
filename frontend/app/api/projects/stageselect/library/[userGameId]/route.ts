import { NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";
import {
  getAuthenticatedUser,
  isStageSelectStatus,
  stageselectReviewStatuses,
  validateRating,
} from "@/lib/stageselect/api";

type RouteContext = {
  params: Promise<{
    userGameId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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
    const { userGameId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const user = await getAuthenticatedUser(supabase, accessToken);
    const status = payload.status;

    if (!isStageSelectStatus(status)) {
      throw new Error("Choose a valid status.");
    }

    if (!payload.gameId || typeof payload.gameId !== "string") {
      throw new Error("Game id is required.");
    }

    const platform =
      typeof payload.platform === "string" ? payload.platform.trim() : "";

    if (stageselectReviewStatuses.has(status) && !platform) {
      throw new Error("Choose a platform before saving.");
    }

    const rating = validateRating(payload.rating);
    const review =
      typeof payload.review === "string" ? payload.review.trim() : "";

    const { data: userGame, error: userGameError } = await supabase
      .from("stageselect_user_games")
      .update({
        status,
        platform: platform || "Unknown",
      })
      .eq("id", userGameId)
      .eq("user_id", user.id)
      .select("id")
      .single();

    if (userGameError || !userGame) {
      throw new Error(userGameError?.message ?? "Library game was not found.");
    }

    const hasReviewData = rating !== null || Boolean(review);

    if (stageselectReviewStatuses.has(status) && hasReviewData) {
      const { error: reviewError } = await supabase
        .from("stageselect_reviews")
        .upsert(
          {
            user_id: user.id,
            game_id: payload.gameId,
            rating,
            body: review || null,
            visibility: "private",
          },
          { onConflict: "user_id,game_id" },
        );

      if (reviewError) {
        throw new Error(reviewError.message);
      }
    } else {
      await supabase
        .from("stageselect_reviews")
        .delete()
        .eq("user_id", user.id)
        .eq("game_id", payload.gameId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update this game.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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
    const { userGameId } = await context.params;
    const user = await getAuthenticatedUser(supabase, accessToken);
    const gameId = new URL(request.url).searchParams.get("gameId");

    if (!gameId) {
      throw new Error("Game id is required.");
    }

    const { error } = await supabase
      .from("stageselect_user_games")
      .delete()
      .eq("id", userGameId)
      .eq("user_id", user.id);

    if (error) {
      throw new Error(error.message);
    }

    await supabase
      .from("stageselect_reviews")
      .delete()
      .eq("user_id", user.id)
      .eq("game_id", gameId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not remove this game.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
