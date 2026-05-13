import { getCrosswordPuzzle } from "@/lib/crosswords/archive";
import {
  getCrosswordRouteContext,
  jsonError,
  requireCrosswordApproval,
} from "@/lib/crosswords/server";
import type { Json } from "@/lib/supabase/database.types";

type CrosswordProgressRouteProps = {
  params: Promise<{
    crosswordId: string;
  }>;
};

export async function PUT(
  request: Request,
  { params }: CrosswordProgressRouteProps,
) {
  try {
    const context = await getCrosswordRouteContext(request);
    await requireCrosswordApproval(context);

    const { crosswordId } = await params;

    if (!getCrosswordPuzzle(crosswordId)) {
      return Response.json({ error: "Crossword not found." }, { status: 404 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const gridState =
      payload.gridState && typeof payload.gridState === "object"
        ? (payload.gridState as Record<string, string>)
        : {};
    const elapsedSeconds = toNonNegativeInteger(payload.elapsedSeconds);
    const checkedCount = toNonNegativeInteger(payload.checkedCount);
    const revealedCount = toNonNegativeInteger(payload.revealedCount);
    const completedAt =
      typeof payload.completedAt === "string" ? payload.completedAt : null;
    const perfect = Boolean(completedAt) && checkedCount === 0 && revealedCount === 0;

    const { data, error } = await context.supabase
      .from("crossword_progress")
      .upsert(
        {
          user_id: context.user.id,
          crossword_id: crosswordId,
          grid_state: gridState as Json,
          elapsed_seconds: elapsedSeconds,
          checked_count: checkedCount,
          revealed_count: revealedCount,
          completed_at: completedAt,
          perfect,
        },
        { onConflict: "user_id,crossword_id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ progress: data });
  } catch (error) {
    return jsonError(error, "Could not save crossword progress.");
  }
}

export async function DELETE(
  request: Request,
  { params }: CrosswordProgressRouteProps,
) {
  try {
    const context = await getCrosswordRouteContext(request);
    await requireCrosswordApproval(context);

    const { crosswordId } = await params;

    if (!getCrosswordPuzzle(crosswordId)) {
      return Response.json({ error: "Crossword not found." }, { status: 404 });
    }

    const { error } = await context.supabase
      .from("crossword_progress")
      .delete()
      .eq("user_id", context.user.id)
      .eq("crossword_id", crosswordId);

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Could not reset crossword progress.");
  }
}

function toNonNegativeInteger(value: unknown) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : 0;
}
