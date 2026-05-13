import type { User } from "@supabase/supabase-js";
import {
  createAdminSupabaseClient,
  createRequestSupabaseClient,
  getBearerToken,
} from "@/lib/supabase/server";

export async function requireCrosswordAdmin(request: Request) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    throw new Response(JSON.stringify({ error: "Log in first." }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  const requestSupabase = createRequestSupabaseClient(accessToken);
  const adminSupabase = createAdminSupabaseClient();

  if (!requestSupabase || !adminSupabase) {
    throw new Response(
      JSON.stringify({ error: "Supabase admin access is not configured." }),
      {
        headers: { "Content-Type": "application/json" },
        status: 503,
      },
    );
  }

  const { data, error } = await requestSupabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: "Log in first." }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  if (!isCrosswordAdmin(data.user)) {
    throw new Response(JSON.stringify({ error: "Admin access required." }), {
      headers: { "Content-Type": "application/json" },
      status: 403,
    });
  }

  return { adminSupabase, user: data.user };
}

export function isCrosswordAdmin(user: User) {
  const email = user.email?.toLowerCase();

  if (!email) {
    return false;
  }

  return getAdminEmails().has(email);
}

export function getAdminEmails() {
  return new Set(
    (process.env.CROSSWORD_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function normalizeInviteCode(code: string) {
  return code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function createInviteCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
