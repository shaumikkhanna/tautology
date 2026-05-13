import {
  createInviteCode,
  normalizeInviteCode,
  requireCrosswordAdmin,
} from "@/lib/crosswords/admin";
import { jsonError } from "@/lib/crosswords/server";

export async function POST(request: Request) {
  try {
    const { adminSupabase, user } = await requireCrosswordAdmin(request);
    const payload = (await request.json()) as {
      email?: string;
      expiresInDays?: number;
      notes?: string;
    };
    const email = payload.email?.trim().toLowerCase() || null;
    const expiresInDays = Number(payload.expiresInDays);
    const expiresAt =
      Number.isInteger(expiresInDays) && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

    let code = "";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = normalizeInviteCode(createInviteCode());
      const { data, error } = await adminSupabase
        .from("crossword_invites")
        .insert({
          code,
          email,
          expires_at: expiresAt,
          notes: payload.notes?.trim() || null,
          created_by: user.id,
        })
        .select("*")
        .single();

      if (!error) {
        const origin = new URL(request.url).origin;
        return Response.json({
          invite: data,
          inviteUrl: `${origin}/play/games/cryptic-crossword-archive?invite=${code}`,
        });
      }

      if (error.code !== "23505") {
        throw new Error(error.message);
      }
    }

    throw new Error("Could not create a unique invite code.");
  } catch (error) {
    return jsonError(error, "Could not create crossword invite.");
  }
}
