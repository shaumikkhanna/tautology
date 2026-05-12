import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let browserSupabaseClient: SupabaseClient<Database> | null = null;

export function createBrowserSupabaseClient(): SupabaseClient<Database> | null {
  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  browserSupabaseClient ??= createClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
  );

  return browserSupabaseClient;
}
