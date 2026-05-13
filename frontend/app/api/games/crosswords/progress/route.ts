import {
  getCrosswordRouteContext,
  jsonError,
  requireCrosswordApproval,
} from "@/lib/crosswords/server";
import { calculateCrosswordStats } from "@/lib/crosswords/stats";

export async function GET(request: Request) {
  try {
    const context = await getCrosswordRouteContext(request);
    await requireCrosswordApproval(context);

    const { data, error } = await context.supabase
      .from("crossword_progress")
      .select("*")
      .eq("user_id", context.user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const progress = data ?? [];

    return Response.json({
      progress,
      stats: calculateCrosswordStats(progress),
    });
  } catch (error) {
    return jsonError(error, "Could not load crossword progress.");
  }
}
