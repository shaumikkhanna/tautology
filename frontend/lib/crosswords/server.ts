import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createRequestSupabaseClient,
  getBearerToken,
  hasServerSupabaseConfig,
} from "@/lib/supabase/server";

export type CrosswordRouteContext = {
  supabase: SupabaseClient<Database>;
  user: User;
};

export function isLocalCrosswordDevBypass(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const url = new URL(request.url);
  const isLocalHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";

  return isLocalHost && request.headers.get("x-crossword-dev-bypass") === "1";
}

export function getConfiguredBearerToken(request: Request) {
  if (!hasServerSupabaseConfig()) {
    throw new Response(JSON.stringify({ error: "Supabase is not configured." }), {
      headers: { "Content-Type": "application/json" },
      status: 503,
    });
  }

  const accessToken = getBearerToken(request);

  if (!accessToken) {
    throw new Response(JSON.stringify({ error: "Log in first." }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  return accessToken;
}

export async function getCrosswordRouteContext(
  request: Request,
): Promise<CrosswordRouteContext> {
  const accessToken = getConfiguredBearerToken(request);
  const supabase = createRequestSupabaseClient(accessToken);

  if (!supabase) {
    throw new Response(JSON.stringify({ error: "Supabase is not configured." }), {
      headers: { "Content-Type": "application/json" },
      status: 503,
    });
  }

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: "Log in first." }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  return { supabase, user: data.user };
}

export async function isApprovedForCrosswords({
  supabase,
  user,
}: CrosswordRouteContext) {
  const { data, error } = await supabase
    .from("crossword_approvals")
    .select("approved_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.approved_at);
}

export async function requireCrosswordApproval(context: CrosswordRouteContext) {
  const approved = await isApprovedForCrosswords(context);

  if (!approved) {
    throw new Response(JSON.stringify({ error: "Crossword access is pending." }), {
      headers: { "Content-Type": "application/json" },
      status: 403,
    });
  }
}

export function jsonError(error: unknown, fallback: string) {
  if (error instanceof Response) {
    return error;
  }

  return Response.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 400 },
  );
}
