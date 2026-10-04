import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const model = "gte-small";
const modelVersion = "supabase-gte-small-mean-normalized-v1";
const dimensions = 384;
type EmbeddingSession = {
  run(
    input: string,
    options: { mean_pool: boolean; normalize: boolean },
  ): unknown;
};
const edgeRuntime = globalThis as typeof globalThis & {
  Supabase: {
    ai: {
      Session: new (modelName: string) => EmbeddingSession;
    };
  };
};
let session: EmbeddingSession | undefined;

Deno.serve(withSupabase({ auth: "secret" }, async (request, context) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const { data, error } = await context.supabaseAdmin.rpc(
    "claim_stageselect_embedding_jobs",
    { batch_size: 1 },
  );

  if (error) {
    return json({ error: error.message }, 500);
  }

  const jobs = (data ?? []) as EmbeddingJob[];
  const completed: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const job of jobs) {
    try {
      const embedding = await getSession().run(job.recommendation_document, {
        mean_pool: true,
        normalize: true,
      });
      const vector = Array.from(embedding as ArrayLike<number>);

      if (
        vector.length !== dimensions ||
        vector.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(
          `${model} ${modelVersion} returned an invalid ${dimensions}-dimensional vector.`,
        );
      }

      const { data: updated, error: updateError } = await context.supabaseAdmin
        .from("stageselect_game_embeddings")
        .update({
          embedding: JSON.stringify(vector),
          status: "ready",
          error: null,
          embedded_at: new Date().toISOString(),
        })
        .eq("id", job.embedding_id)
        .eq("content_hash", job.content_hash)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (updated) {
        completed.push(job.embedding_id);
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Embedding generation failed.";

      await context.supabaseAdmin
        .from("stageselect_game_embeddings")
        .update({
          embedding: null,
          status: "failed",
          error: message.slice(0, 1_000),
          embedded_at: null,
        })
        .eq("id", job.embedding_id)
        .eq("content_hash", job.content_hash)
        .eq("status", "processing");

      failed.push({ id: job.embedding_id, error: message });
    }
  }

  return json({
    claimed: jobs.length,
    completed,
    failed,
    model,
    modelVersion,
    dimensions,
  });
}));

type EmbeddingJob = {
  embedding_id: string;
  game_id: string;
  recommendation_document: string;
  content_hash: string;
};

function getSession() {
  session ??= new edgeRuntime.Supabase.ai.Session(model);
  return session;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
