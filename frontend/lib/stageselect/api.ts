import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageSelectGameSearchResult } from "@/lib/igdb/types";
import type { Database } from "@/lib/supabase/database.types";

export const stageselectStatuses = [
  "finished",
  "left",
  "playing",
  "backlogged",
  "wishlisted",
] as const;

export type StageSelectStatus = (typeof stageselectStatuses)[number];

export const stageselectReviewStatuses = new Set<string>([
  "finished",
  "left",
  "playing",
  "backlogged",
]);

export function isStageSelectStatus(value: unknown): value is StageSelectStatus {
  return (
    typeof value === "string" &&
    stageselectStatuses.includes(value as StageSelectStatus)
  );
}

export function validateRating(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Rating must be a number.");
  }

  const rating = Number(value);

  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5) {
    throw new Error("Rating must be between 0.5 and 5.");
  }

  if ((rating * 2) % 1 !== 0) {
    throw new Error("Rating must use half-star increments.");
  }

  return rating;
}

export function validateGamePayload(
  value: unknown,
): StageSelectGameSearchResult {
  if (!value || typeof value !== "object") {
    throw new Error("Game payload is required.");
  }

  const game = value as Partial<StageSelectGameSearchResult>;

  const igdbId = game.igdbId;
  const title = game.title;

  if (!Number.isInteger(igdbId) || !igdbId || igdbId <= 0) {
    throw new Error("Game must include a valid IGDB id.");
  }

  if (!title || typeof title !== "string") {
    throw new Error("Game must include a title.");
  }

  return {
    igdbId,
    title,
    slug: typeof game.slug === "string" ? game.slug : undefined,
    summary: typeof game.summary === "string" ? game.summary : undefined,
    coverUrl: typeof game.coverUrl === "string" ? game.coverUrl : undefined,
    releaseYear:
      typeof game.releaseYear === "number" ? game.releaseYear : undefined,
    platforms: Array.isArray(game.platforms)
      ? game.platforms.filter((item): item is string => typeof item === "string")
      : [],
    genres: Array.isArray(game.genres)
      ? game.genres.filter((item): item is string => typeof item === "string")
      : [],
    themes: stringArray(game.themes),
    keywords: stringArray(game.keywords),
    gameModes: stringArray(game.gameModes),
    playerPerspectives: stringArray(game.playerPerspectives),
    similarGameIgdbIds: Array.isArray(game.similarGameIgdbIds)
      ? game.similarGameIgdbIds.filter(
          (item): item is number => Number.isInteger(item) && item > 0,
        )
      : [],
    category: typeof game.category === "number" ? game.category : undefined,
    gameType: typeof game.gameType === "number" ? game.gameType : undefined,
    totalRating:
      typeof game.totalRating === "number" ? game.totalRating : undefined,
    totalRatingCount:
      typeof game.totalRatingCount === "number" ? game.totalRatingCount : 0,
    popularityScore:
      typeof game.popularityScore === "number" ? game.popularityScore : 0,
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function getAuthenticatedUser(
  supabase: SupabaseClient<Database>,
  accessToken: string,
) {
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error("Log in before changing your library.");
  }

  return data.user;
}
