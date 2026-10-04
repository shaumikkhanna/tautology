# StageSelect Semantic Embedding Foundation

This implementation stores semantic game representations and uses ready vectors
as one bounded component of production ranking. Structured scoring remains the
fallback whenever a candidate or useful preference signal lacks an embedding.

## Representation

Every cached game receives a canonical document derived only from shared IGDB
metadata:

```text
Title: ...
Summary: ...
Release year: ...
Platforms: ...
Genres: ...
Themes: ...
Keywords: ...
Game modes: ...
Player perspectives: ...
```

Whitespace, ordering, and duplicate labels are normalized so equivalent
metadata produces identical input. The document is SHA-256 hashed together
with `game-metadata-v1`; changing either the content or document format creates
a different hash and invalidates the old vector.

Private reviews are never included. They remain preference signals, not game
content.

## Model contract

The first provider contract is:

```text
model: gte-small
model version: supabase-gte-small-mean-normalized-v1
dimensions: 384
pooling: mean
normalized: true
```

Mean pooling converts token-level outputs into one game vector. Normalization
makes the vector length equal to one, so cosine similarity compares direction
rather than document magnitude.

The application-facing `EmbeddingProvider` interface is deliberately narrow:

```ts
type EmbeddingProvider = {
  model: string;
  version: string;
  dimensions: number;
  embed(inputs: string[]): Promise<number[][]>;
};
```

This keeps model choice separate from document construction, storage, scoring,
and evaluation.

## Asynchronous lifecycle

```text
game cached or refreshed
        -> canonical document and hash stored
        -> database trigger creates/resets a pending vector row
        -> scheduled worker atomically claims one job
        -> gte-small generates normalized vectors
        -> worker stores a ready vector only if the hash is still current
```

The stale-hash check matters: if metadata changes while a job is processing,
the obsolete result cannot overwrite the newly queued version. Failed jobs are
retryable up to five attempts, and jobs stuck in `processing` for ten minutes
can be reclaimed.

The vector table has RLS enabled and no browser-facing policies. Raw vectors and
job operations are server-managed shared catalogue infrastructure.

## Setup

1. Apply `20260922001000_stageselect_game_embeddings.sql`.
2. Deploy `supabase/functions/stageselect-embed-games` with JWT verification
   disabled. The worker uses Supabase's server-auth wrapper to accept only a
   secret key supplied through the `apikey` header; browser/user tokens cannot
   invoke it. The checked-in `supabase/config.toml` preserves this setting.
3. From `frontend/`, inspect the existing-game backfill:

   ```bash
   npm run backfill:stageselect-recommendation-documents
   ```

4. After reviewing the count, write the documents and queue rows:

   ```bash
   npm run backfill:stageselect-recommendation-documents -- --write
   ```

5. Apply `20260922002000_stageselect_embedding_schedule.sql`, then store the
   project URL and existing server key in encrypted Supabase Vault entries
   without printing either value:

   ```bash
   npm run configure:stageselect-embedding-schedule
   ```

   Every five minutes the database checks for claimable work. It invokes the
   Edge Function for one game only when pending, retryable, or stale work exists;
   an empty queue causes no HTTP request or model boot. The deliberately small
   unit of work keeps native `gte-small` inference inside hosted Edge Function
   compute limits.

6. The manual processor remains available for initial catch-up or recovery and
   reports final coverage without printing the configured server secret:

   ```bash
   npm run process:stageselect-embeddings
   ```

   The schedule uses current `sb_secret_...` keys. Rotate the Vault entry by
   rerunning the configure command after rotating the server key.

7. If an earlier ten-game worker was deployed, apply
   `20260923001000_stageselect_embedding_worker_limits.sql` and redeploy the
   function. The migration changes scheduled invocations to one game, extends
   the `pg_net` allowance to 120 seconds, and requeues jobs stranded in
   `processing` by a platform resource termination.

8. Apply `20260923002000_stageselect_embedding_schedule_frequency.sql` to move
   the schedule to every five minutes and skip Edge Function invocations while
   the queue is empty.

Do not expose the service-role key to the browser or commit it to the repository.

## Hybrid scoring

Apply `20260923000000_stageselect_semantic_ranking.sql` to enable semantic
ranking. The authenticated RPC:

- derives the same signed seed weights as the structured preference profile;
- computes weighted positive and negative cosine similarity separately;
- excludes a candidate's own vector from its evidence;
- returns only similarity summaries, never raw vectors; and
- supports both library UUIDs and Discover IGDB ids.

The application converts those summaries to a `0..1` preference feature. Fewer
than three embedded signals are shrunk toward the neutral value `0.5`, limiting
the influence of a very small history. When semantic coverage exists, relevance
is `78%` structured score and `22%` semantic preference. When it does not,
relevance is exactly the structured score.

The current model version is `hybrid-semantic-multitaste-mmr-v2`.
Recommendation impressions record `semantic`, `semanticNegative`,
`semanticCoverage`, and `clusterAffinity` alongside the existing score
components. Profiles with insufficient positive evidence retain the original
global structured score.

## Evaluation boundary

The offline evaluator now contains separate structured, global hybrid, and
multi-interest hybrid variants. The fixed synthetic profiles do not contain
model-generated embeddings and are below the clustering threshold, so those
variants intentionally tie on the baseline fixture; this verifies graceful
fallback. Focused held-out cases verify that precomputed semantic evidence can
improve a metadata tie and that cluster affinity can preserve a distinct taste.
Organic run logs and a manual before/after review should still be used to
validate real-vector usefulness.
