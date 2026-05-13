import { normalizeInviteCode } from "@/lib/crosswords/admin";
import { jsonError } from "@/lib/crosswords/server";
import {
  createAdminSupabaseClient,
  createRequestSupabaseClient,
  getBearerToken,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return Response.json({ error: "Log in first." }, { status: 401 });
    }

    const requestSupabase = createRequestSupabaseClient(accessToken);
    const adminSupabase = createAdminSupabaseClient();

    if (!requestSupabase || !adminSupabase) {
      return Response.json(
        { error: "Supabase admin access is not configured." },
        { status: 503 },
      );
    }

    const { data: userData, error: userError } =
      await requestSupabase.auth.getUser(accessToken);

    if (userError || !userData.user) {
      return Response.json({ error: "Log in first." }, { status: 401 });
    }

    const payload = (await request.json()) as { code?: string };
    const code = normalizeInviteCode(payload.code ?? "");

    if (!code) {
      return Response.json({ error: "Invite code is required." }, { status: 400 });
    }

    const { data: invite, error: inviteError } = await adminSupabase
      .from("crossword_invites")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    if (!invite) {
      return Response.json({ error: "Invite code was not found." }, { status: 404 });
    }

    if (invite.used_at) {
      return Response.json({ error: "Invite code has already been used." }, { status: 409 });
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return Response.json({ error: "Invite code has expired." }, { status: 410 });
    }

    const userEmail = userData.user.email?.toLowerCase() ?? "";
    if (invite.email && invite.email.toLowerCase() !== userEmail) {
      return Response.json(
        { error: "Invite code is for a different email address." },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();
    const { error: approvalError } = await adminSupabase
      .from("crossword_approvals")
      .upsert(
        {
          user_id: userData.user.id,
          email: userEmail,
          approved_at: now,
          notes: `Invite ${code}`,
        },
        { onConflict: "user_id" },
      );

    if (approvalError) {
      throw new Error(approvalError.message);
    }

    const { error: updateError } = await adminSupabase
      .from("crossword_invites")
      .update({
        used_by: userData.user.id,
        used_at: now,
      })
      .eq("code", code);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return Response.json({ approved: true });
  } catch (error) {
    return jsonError(error, "Could not redeem crossword invite.");
  }
}
