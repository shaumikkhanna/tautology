import { getCrosswordSummaries } from "@/lib/crosswords/archive";
import {
  getCrosswordRouteContext,
  isLocalCrosswordDevBypass,
  jsonError,
  requireCrosswordApproval,
} from "@/lib/crosswords/server";

export async function GET(request: Request) {
  try {
    if (isLocalCrosswordDevBypass(request)) {
      return Response.json({ crosswords: getCrosswordSummaries() });
    }

    const context = await getCrosswordRouteContext(request);
    await requireCrosswordApproval(context);

    return Response.json({ crosswords: getCrosswordSummaries() });
  } catch (error) {
    return jsonError(error, "Could not load crossword archive.");
  }
}
