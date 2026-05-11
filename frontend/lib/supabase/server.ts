import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export function hasServerSupabaseConfig() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function createRequestSupabaseClient(
  accessToken: string,
): SupabaseClient<Database> | null {
  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function createAdminSupabaseClient(): SupabaseClient<Database> | null {
  if (!supabaseUrl || !supabaseSecretKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice("bearer ".length).trim();
}
