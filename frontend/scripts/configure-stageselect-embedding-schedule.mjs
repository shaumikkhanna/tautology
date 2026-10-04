import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.",
  );
}

if (!secretKey.startsWith("sb_secret_")) {
  throw new Error(
    "The automatic schedule requires a current sb_secret_ Supabase key.",
  );
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await supabase.rpc(
  "configure_stageselect_embedding_schedule",
  {
    project_url: supabaseUrl,
    worker_secret: secretKey,
  },
);

if (error) {
  throw new Error(error.message);
}

console.log(
  "Stored the StageSelect worker URL and secret in Supabase Vault. The embedding schedule is active.",
);
