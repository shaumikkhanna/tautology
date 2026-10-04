import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Enums } from "@/lib/supabase/database.types";

export const recommendationOutcomeAttributionDays = 90;

export type RecommendationOutcome =
  | "saved"
  | "started"
  | "finished"
  | "left"
  | "rated";

export type RecommendationOutcomeEvent = {
  outcome: RecommendationOutcome;
  rating: number | null;
};

type OutcomeInput = {
  saved?: boolean;
  status?: Enums<"stageselect_game_status">;
  rating?: number | null;
};

type RecordOutcomeInput = OutcomeInput & {
  recommendationId?: string;
  allowRecentImpression?: boolean;
};

export function buildRecommendationOutcomeEvents({
  saved = false,
  status,
  rating = null,
}: OutcomeInput): RecommendationOutcomeEvent[] {
  const events: RecommendationOutcomeEvent[] = [];

  if (saved) {
    events.push({ outcome: "saved", rating: null });
  }

  if (status === "playing") {
    events.push({ outcome: "started", rating: null });
  } else if (status === "finished") {
    events.push({ outcome: "finished", rating: null });
  } else if (status === "left") {
    events.push({ outcome: "left", rating: null });
  }

  if (typeof rating === "number" && rating >= 0.5 && rating <= 5) {
    events.push({ outcome: "rated", rating });
  }

  return events;
}

export async function recordRecommendationOutcomes(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameId: string,
  input: RecordOutcomeInput,
) {
  const events = buildRecommendationOutcomeEvents(input);

  if (events.length === 0) {
    return;
  }

  try {
    let impressionQuery = supabase
      .from("stageselect_recommendation_impressions")
      .select("id")
      .eq("user_id", userId)
      .eq("game_id", gameId);

    if (input.recommendationId) {
      impressionQuery = impressionQuery.eq("id", input.recommendationId);
    } else if (input.allowRecentImpression) {
      const cutoff = new Date(
        Date.now() - recommendationOutcomeAttributionDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      impressionQuery = impressionQuery.gte("shown_at", cutoff);
    } else {
      return;
    }

    const { data: impression, error: impressionError } = await impressionQuery
      .order("shown_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (impressionError || !impression) {
      if (impressionError) {
        console.error(
          "Could not resolve a recommendation impression for an outcome.",
        );
      }
      return;
    }

    const occurredAt = new Date().toISOString();
    const attributionMethod = input.recommendationId
      ? "direct"
      : "recent_impression";
    const { error: outcomeError } = await supabase
      .from("stageselect_recommendation_outcomes")
      .upsert(
        events.map((event) => ({
          user_id: userId,
          impression_id: impression.id,
          game_id: gameId,
          outcome: event.outcome,
          rating: event.rating,
          attribution_method: attributionMethod,
          occurred_at: occurredAt,
        })),
        {
          onConflict: "impression_id,outcome",
          ignoreDuplicates: true,
        },
      );

    if (outcomeError) {
      console.error("Could not record a recommendation outcome.");
      return;
    }

    if (input.saved && input.recommendationId) {
      const { error: impressionUpdateError } = await supabase
        .from("stageselect_recommendation_impressions")
        .update({ action: "saved", acted_at: occurredAt })
        .eq("id", impression.id)
        .eq("user_id", userId)
        .is("action", null);

      if (impressionUpdateError) {
        console.error("Could not mark a recommendation impression as saved.");
      }
    }
  } catch {
    // Outcome measurement must never make a library operation fail.
    console.error("Could not record recommendation outcomes.");
  }
}
