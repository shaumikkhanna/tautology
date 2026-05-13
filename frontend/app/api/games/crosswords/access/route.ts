import {
  getCrosswordRouteContext,
  isApprovedForCrosswords,
  jsonError,
} from "@/lib/crosswords/server";

export async function GET(request: Request) {
  try {
    const context = await getCrosswordRouteContext(request);
    const approved = await isApprovedForCrosswords(context);

    return Response.json({ approved });
  } catch (error) {
    return jsonError(error, "Could not check crossword access.");
  }
}
