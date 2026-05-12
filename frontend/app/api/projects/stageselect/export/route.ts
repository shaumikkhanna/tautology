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
