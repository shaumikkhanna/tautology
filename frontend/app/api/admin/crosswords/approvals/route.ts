import { requireCrosswordAdmin } from "@/lib/crosswords/admin";
import { jsonError } from "@/lib/crosswords/server";

export async function POST(request: Request) {
  try {
    const { adminSupabase } = await requireCrosswordAdmin(request);
    const payload = (await request.json()) as { email?: string };
    const email = payload.email?.trim().toLowerCase();

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) {
      throw new Error(error.message);
    }

    const user = data.users.find(
      (item) => item.email?.toLowerCase() === email,
    );

    if (!user) {
      return Response.json(
        { error: "No signed-up user found for that email." },
        { status: 404 },
      );
    }

    const { data: approval, error: approvalError } = await adminSupabase
      .from("crossword_approvals")
      .upsert(
        {
          user_id: user.id,
          email,
          approved_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (approvalError) {
      throw new Error(approvalError.message);
    }

    return Response.json({ approval });
  } catch (error) {
    return jsonError(error, "Could not approve crossword user.");
  }
}
