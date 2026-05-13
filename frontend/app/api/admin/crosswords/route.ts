import { requireCrosswordAdmin } from "@/lib/crosswords/admin";
import { jsonError } from "@/lib/crosswords/server";

export async function GET(request: Request) {
  try {
    const { adminSupabase } = await requireCrosswordAdmin(request);
    const [{ data: usersData, error: usersError }, { data: approvals, error: approvalsError }, { data: invites, error: invitesError }] =
      await Promise.all([
        adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        adminSupabase
          .from("crossword_approvals")
          .select("*")
          .order("created_at", { ascending: false }),
        adminSupabase
          .from("crossword_invites")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

    if (usersError) {
      throw new Error(usersError.message);
    }

    if (approvalsError) {
      throw new Error(approvalsError.message);
    }

    if (invitesError) {
      throw new Error(invitesError.message);
    }

    const approvedUserIds = new Set(
      (approvals ?? [])
        .filter((approval) => approval.approved_at)
        .map((approval) => approval.user_id),
    );
    const users = usersData.users.map((user) => ({
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      approved: approvedUserIds.has(user.id),
    }));

    return Response.json({
      users,
      approvals: approvals ?? [],
      invites: invites ?? [],
    });
  } catch (error) {
    return jsonError(error, "Could not load crossword admin.");
  }
}
