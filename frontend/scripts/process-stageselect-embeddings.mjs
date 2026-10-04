import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and a Supabase server secret are required.",
  );
}

const functionUrl = `${supabaseUrl}/functions/v1/stageselect-embed-games`;
const headers = {
  apikey: secretKey,
  "content-type": "application/json",
};

if (secretKey.split(".").length === 3) {
  headers.authorization = `Bearer ${secretKey}`;
}

let totalClaimed = 0;
let totalCompleted = 0;
let totalFailed = 0;

for (let batch = 1; batch <= 50; batch += 1) {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ batchSize: 1 }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.error ?? `Embedding worker returned ${response.status}.`,
    );
  }

  const claimed = Number(payload.claimed ?? 0);
  const completed = Array.isArray(payload.completed)
    ? payload.completed.length
    : 0;
  const failed = Array.isArray(payload.failed) ? payload.failed.length : 0;

  totalClaimed += claimed;
  totalCompleted += completed;
  totalFailed += failed;
  console.log(
    `Batch ${batch}: claimed ${claimed}, completed ${completed}, failed ${failed}.`,
  );

  if (claimed === 0) {
    break;
  }
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const coverage = {};

for (const status of ["pending", "processing", "ready", "failed"]) {
  const { count, error } = await supabase
    .from("stageselect_game_embeddings")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) {
    throw new Error(error.message);
  }

  coverage[status] = count ?? 0;
}

console.log(
  `Run totals: claimed ${totalClaimed}, completed ${totalCompleted}, failed ${totalFailed}.`,
);
console.log(
  `Coverage: ${coverage.ready} ready, ${coverage.pending} pending, ${coverage.processing} processing, ${coverage.failed} failed.`,
);

if (coverage.pending > 0 || coverage.processing > 0 || coverage.failed > 0) {
  process.exitCode = 1;
}
