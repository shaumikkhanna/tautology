import { getCrosswordPuzzle } from "@/lib/crosswords/archive";
import {
  getCrosswordRouteContext,
  isLocalCrosswordDevBypass,
  jsonError,
  requireCrosswordApproval,
} from "@/lib/crosswords/server";

type CrosswordRouteProps = {
  params: Promise<{
    crosswordId: string;
  }>;
};

export async function GET(request: Request, { params }: CrosswordRouteProps) {
  try {
    const { crosswordId } = await params;
    const crossword = getCrosswordPuzzle(crosswordId);

    if (!crossword) {
      return Response.json({ error: "Crossword not found." }, { status: 404 });
    }

    if (isLocalCrosswordDevBypass(request)) {
      return Response.json({ crossword });
    }

    const context = await getCrosswordRouteContext(request);
    await requireCrosswordApproval(context);

    return Response.json({ crossword });
  } catch (error) {
    return jsonError(error, "Could not load this crossword.");
  }
}
