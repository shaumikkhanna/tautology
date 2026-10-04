# StageSelect Recommendations: Personalized Game Recommendation Plan

## Implementation Status

The measurement work from Phase 0 and the product work through Phase 4 are
implemented. Phase 5 has begun with downstream outcome collection. The
repository now contains:

- A pure TypeScript preference-profile, scoring, explanation, and MMR
  diversification core under `frontend/lib/stageselect/recommendations/`.
- A `Recommendations` tab with separate `Play Next` and `Discover` views,
  platform filtering, and a Familiar/Adventurous control.
- Evidence-backed recommendation reasons and an initial Preference profile panel.
- Persistent Discover feedback with authenticated server mutations, RLS,
  immediate reranking, active-state toggling, and undo. `More like this` and
  `Not for me` adjust preference weights; `Don't show` is a neutral dismissal.
- A Discover lane that merges IGDB `similar_games` with batched searches built
  from weighted genres, themes, modes, perspectives, and keywords. It removes
  owned games and duplicate candidates before structured ranking, platform
  filtering, diversity reranking, and wishlist save.
- Enriched IGDB normalization and cache columns for themes, keywords, game
  modes, perspectives, similar-game ids, ratings, and game type.
- Versioned recommendation-run and impression logging for both surfaces. Each
  impression records the active controls, candidate source, rank, score
  components, and explanation evidence; direct feedback is attributed to the
  impression that produced it. Logging is private, protected by RLS, included
  in the user's data export, and deliberately excludes review text.
- A deterministic offline evaluation harness with six versioned synthetic taste
  profiles, six comparable ranking variants, ranking/diversity/coverage metrics,
  guardrail checks, detailed rankings, JSON output, and a checked-in baseline.
- The Phase 3 semantic foundation: canonical versioned game documents and
  hashes, a narrow provider contract, 384-dimensional pgvector storage,
  automatic pending-job creation, bounded atomic claiming and retry behavior,
  a secret-authenticated `gte-small` Edge Function worker, a Vault-backed
  workload-aware five-minute schedule that invokes one game only when work is
  claimable, automatic recovery of stranded leases, and an explicit
  existing-cache backfill.
- A server-only semantic scoring RPC that derives weighted positive and negative
  cosine summaries from ratings, outcomes, and direct feedback without exposing
  vectors. Ready scores contribute a bounded 22% of hybrid relevance, sparse
  evidence is shrunk toward neutral, and missing vectors preserve the structured
  score exactly.
- The Phase 4 multi-interest model: deterministic weighted k-medoids groups a
  sufficiently rich positive history into two to four distinct taste patterns
  using structured game facets. Each displayed group is backed by named
  supporting games. Candidate affinity to its strongest group contributes 30%
  of the structured facet subscore, while small histories preserve the previous
  global-profile score exactly. A no-cluster evaluation variant remains as the
  comparison baseline.
- A private blind ranking check compares the global-profile and multi-interest
  variants on the same real Discover candidates and controls. Stable A/B side
  assignment prevents the interface from revealing the variant, ties and
  revisions are retained, RLS protects the results, and user exports include
  the complete qualitative evaluation record.
- A private recommendation outcome funnel attributes Discover saves directly
  to their impression and associates later starts, finishes, abandons, and
  ratings with the most recent matching impression inside a bounded 90-day
  window. Outcome logging is best-effort, protected by RLS, included in the
  user export, and explicitly treated as observational rather than causal.
- A versioned local outcome evaluator groups exported observations by model and
  surface, applies signal-specific maturity windows to avoid right-censoring
  bias, reports Wilson intervals and data-quality failures, and refuses to call
  small cohorts comparison-ready.
- Unit coverage for signals, positive/negative preferences, facet query
  generation, candidate deduplication and provenance, ranking, platform
  eligibility, direct feedback recency, diversity, and deterministic taste
  clustering.

The semantic and multi-interest variants are registered separately in the
evaluator. Fallback, negative-evidence, semantic tie-breaking, and distinct-taste
preservation are covered by focused tests. The fixed synthetic fixture has no
model-generated vectors, so production comparisons and qualitative review
remain the final real-world measurement step.

## 1. Executive Summary

StageSelect Recommendations is a private, explainable recommendation system that helps a
user answer two related questions:

1. **What should I play next from games I already own or intend to play?**
2. **What should I discover outside my current library?**

The feature will learn a compact representation of the user's taste from
ratings, completion status, platforms, reviews, and recommendation feedback.
It will retrieve plausible games from IGDB, rank them with a hybrid
content-based model, diversify the final list, and explain each result using
concrete evidence from the user's library.

The initial release will deliberately avoid collaborative filtering. StageSelect
is currently a private, early-stage product with too few users and interactions
for user-to-user similarity to be reliable. A content-based system has a much
better cold-start story for the product: it can become useful as soon as one
person has rated a modest library.

The intended portfolio story is not “called a model API.” It is:

> Designed and shipped an explainable two-stage recommender system with hybrid
> retrieval, semantic embeddings, explicit and implicit feedback, diversity
> reranking, offline evaluation, model versioning, and privacy-aware serving.

## 2. Product Goals

### Primary goal

Give a signed-in user a small set of recommendations that feel personally
useful, varied, and understandable.

### Secondary goals

- Make the user's existing backlog actionable rather than merely catalogued.
- Turn StageSelect's saved data into a visible “Preference profile” profile.
- Improve recommendations from direct feedback without requiring model
  retraining after every click.
- Build an architecture that can later support collaborative or learning-to-rank
  models without replacing the product surface.
- Keep the recommendation pipeline testable and observable.

### Non-goals for the first release

- A conversational game chatbot.
- Generative reviews or fabricated game descriptions.
- Social recommendations or public user profiling.
- Deep learning trained from scratch.
- Predicting exact ratings with false precision.
- Optimizing solely for clicks or engagement time.

## 3. User Experience

### 3.1 New `Recommendations` tab

Add a fourth StageSelect tab alongside Search, Library, and Stats.

The page contains two lanes:

#### Play Next

Ranks only games already marked `backlogged`, `wishlisted`, or `playing`.
This lane answers a high-confidence, low-friction question and works without
fetching any new IGDB candidates.

#### Discover

Recommends games that are not already in the user's library. Candidates come
from IGDB similarity links and searches based on the user's strongest taste
facets.

### 3.2 Recommendation card

Each card should show:

- Cover, title, release year, genres, and available platforms.
- A qualitative match label such as `Excellent match`, `Strong match`, or
  `Worth exploring`; do not expose an uncalibrated “93% match.”
- Two or three evidence-based reasons.
- A source label: `From your backlog`, `Similar to ...`, or `Taste match`.
- Actions: `More like this`, `Not for me`, `Save`, and `Why this?`.

Example explanation:

> Because you rated *Hades* 5 stars, often finish action roguelikes, and play
> most often on Nintendo Switch. This is a slightly more adventurous pick than
> your usual games.

The explanation must be assembled from structured scoring evidence. An LLM is
not required and must never invent a relationship that was not used by the
ranker.

### 3.3 Controls

Start with three controls whose effect can be made mathematically explicit:

- **Familiar ↔ Adventurous**: adjusts exploitation versus exploration.
- **Backlog ↔ Discovery**: changes the mix of owned and unseen games.
- **Platform**: `Any` or a platform present in the user's library.

Do not add a playtime control until StageSelect has a trustworthy duration data
source. IGDB's current game metadata does not provide a general completion-time
field.

### 3.4 Preference profile

Add a compact Preference profile panel either inside `Recommendations` or as an extension of
Stats. It should show:

- Strongest genres, themes, game modes, and platforms.
- Two to four taste clusters rather than one oversimplified label.
- “Comfort zone” versus “curiosity” traits.
- Supporting games for every trait.
- A data-confidence state: `Learning`, `Developing`, or `Established`.

Examples of clusters are “narrative exploration,” “systems-heavy tactics,” and
“short arcade competition.” These labels should initially come from the
dominant structured facets in each cluster, not free-form generation.

### 3.5 Cold-start states

The UI must not pretend to know a new user.

- **0–2 useful signals:** show popular or manually diverse candidates and ask
  the user to rate five games.
- **3–7 useful signals:** show provisional results with a `Low data confidence`
  label.
- **8+ useful signals:** enable the full personalized and diversified ranking.

A useful signal is a rating, `finished`/`left` outcome, or explicit recommendation
feedback. Wishlist and backlog status alone express interest but not enjoyment,
so they count less.

## 4. Why This Is a Machine-Learning Feature

The system is a recommender, not a rules-only filter. It represents games and
users in a learned semantic vector space, estimates preference from feedback,
and ranks unseen items by predicted relevance. Rules are still used where they
are the correct tool: permissions, platform eligibility, duplicate removal,
business constraints, and readable explanations.

The system has three distinct stages:

```text
IGDB + StageSelect cache
          |
          v
  Candidate retrieval       High recall: find ~100-300 plausible games
          |
          v
 Personalized ranking       High precision: score relevance for this user
          |
          v
 Diversity reranking        Produce a useful, non-repetitive top 6-12
```

Separating these stages matters. Retrieval should avoid missing good games;
ranking should order candidates accurately; reranking should prevent a narrow
result set in which every game is nearly interchangeable.

## 5. Recommendation Theory

### 5.1 Content-based recommendation

Each game is represented by its own attributes. The system recommends games
whose representations are close to the user's learned preference profile.

This is preferable to collaborative filtering at StageSelect's current scale:

- It needs one user's history rather than a large user-item interaction matrix.
- It handles niche games and private libraries.
- Its recommendations can be traced back to metadata and known preferences.
- It avoids leaking information across users.

Its main weakness is overspecialization: recommending only things very similar
to what the user already knows. The system addresses that with explicit exploration
controls and diversity reranking.

### 5.2 Game representations

The system uses two complementary representations.

#### Structured vector

A sparse, interpretable vector built from:

- Genres.
- Themes.
- Keywords.
- Game modes.
- Player perspectives, if useful after inspection.
- Release-era bucket.
- Platform family.

Categorical values use multi-hot encoding. Very common facets can later use an
inverse-frequency weight so that a rare informative keyword contributes more
than a generic label.

#### Semantic embedding

A dense embedding generated from a canonical text document:

```text
Title: ...
Summary: ...
Genres: ...
Themes: ...
Keywords: ...
Game modes: ...
```

Embeddings place semantically related games near one another even when they do
not share the exact same keywords. Cosine similarity is the initial distance
measure:

```text
cosine(a, b) = (a · b) / (||a|| ||b||)
```

If stored vectors are normalized, inner product produces the same ordering and
may be used as an implementation optimization.

### 5.3 From game vectors to a user profile

The first user model is a weighted preference vector inspired by relevance
feedback methods such as the Rocchio algorithm:

```text
positive_centroid = weighted_mean(vectors for positive signals)
negative_centroid = weighted_mean(vectors for negative signals)

user_vector = normalize(
  alpha * positive_centroid
  - beta * negative_centroid
)
```

Initial signal weights, to be tuned through evaluation:

| Signal | Suggested weight | Interpretation |
| --- | ---: | --- |
| `More like this` | +2.0 | Strong direct preference |
| 5-star rating | +1.5 | Strong positive evidence |
| 4-star rating | +1.0 | Positive evidence |
| Finished, unrated | +0.5 | Weak positive evidence |
| Playing | +0.35 | Current interest, outcome unknown |
| Wishlisted | +0.20 | Intent, not enjoyment |
| Backlogged | +0.10 | Very weak intent |
| 2-star rating | -0.75 | Negative evidence |
| 1-star rating | -1.25 | Strong negative evidence |
| Left, unrated | -0.50 | Negative outcome with ambiguity |
| `Not for me` | -2.0 | Strong direct negative preference |

Three-star games are approximately neutral. Rating weights should be centered
around the individual user's mean once enough ratings exist, because one user
may use 3 stars generously while another rarely rates below 4.

Review text is private and optional. In the first semantic release it is not
sent to an embedding provider. A later opt-in experiment may use it to infer
liked and disliked aspects, but that must have explicit disclosure and a
separate privacy decision.

### 5.4 Multi-interest profiles

A single centroid can average away distinct tastes. Someone who loves both
tactical strategy and cozy farming games may receive mediocre games halfway
between the two.

Once a user has at least roughly 12 positive signals, cluster their positive
game vectors into two to four taste groups. Choose the cluster count with a
bounded heuristic rather than claiming statistical certainty on tiny samples.
Candidates receive the maximum or weighted-softmax similarity across these
interest vectors instead of similarity to only one global centroid.

These clusters also power Preference profile. This creates a clean relationship between
the model and what the user sees.

### 5.5 Hybrid scoring

Semantic similarity alone is not the product objective. The initial ranker
combines normalized features:

```text
score(u, g) =
    w_semantic  * semantic_similarity(u, g)
  + w_facets    * structured_facet_similarity(u, g)
  + w_platform  * platform_affinity(u, g)
  + w_quality   * confidence_adjusted_IGDB_quality(g)
  + w_novelty   * novelty(g)
  + w_intent    * backlog_or_wishlist_signal(u, g)
  - w_negative  * negative_profile_similarity(u, g)
```

Important details:

- Popularity must be log-scaled or percentile-normalized so blockbusters do not
  dominate personal relevance.
- Global ratings must be confidence-adjusted by rating count before use.
- Platform is a soft preference unless the user explicitly filters it.
- Candidate source is recorded as a feature and for diagnostics.
- Features and component scores are returned internally so explanations and
  debugging use the same evidence as ranking.

The first version uses hand-set weights. A later learning-to-rank version can
learn these weights after StageSelect has enough labeled impressions and
feedback. Starting with a learned ranker before collecting representative data
would add complexity without adding trustworthy intelligence.

### 5.6 Diversity with Maximal Marginal Relevance

After ranking, apply Maximal Marginal Relevance (MMR) greedily:

```text
MMR(g) = lambda * relevance(g)
         - (1 - lambda) * max_similarity(g, already_selected)
```

- `lambda` near 1 favors familiar, highly relevant games.
- Lower `lambda` favors a more varied set.
- The Familiar/Adventurous control maps to a safe range of `lambda`, not its
  full theoretical range.

MMR makes diversity an explicit product choice rather than a random shuffle.

### 5.7 Exploration versus exploitation

Exploitation recommends the safest high-scoring games. Exploration introduces
promising uncertainty so the system can learn and avoid a filter bubble.

The first release uses deterministic exploration:

- Reserve one or two positions for a different taste cluster, era, or genre.
- Keep a minimum relevance threshold.
- Never violate explicit platform filters or repeat rejected games.

A contextual bandit is a possible later phase only after impression, action,
and outcome logging is mature. It should not be presented as part of v1.

## 6. Candidate Generation

The system needs a bounded candidate universe before it can rank anything.

### 6.1 Play Next candidates

Retrieve the user's own games with status `playing`, `backlogged`, or
`wishlisted`. This lane is available first because all required data already
exists in StageSelect.

### 6.2 Discover candidates

Use multiple sources so one source's bias does not define the entire result:

1. IGDB `similar_games` from the user's strongest positive seed games.
2. IGDB queries matching the user's leading genres, themes, and game modes.
3. High-quality games from underrepresented taste clusters.
4. A small exploratory pool outside the strongest cluster.

Batch-hydrate candidate IDs and cache normalized metadata in
`stageselect_games`. Exclude:

- Games already in the user's library for the Discover lane.
- Games explicitly rejected by the user, subject to an expiry policy.
- Versions whose `version_parent` is non-null.
- Adult results using IGDB's documented theme filter where appropriate.
- Results without sufficient metadata for ranking.

Respect IGDB's documented limit of four requests per second and eight open
requests. Candidate refreshes should be cached, deduplicated, batched, and
performed server-side.

### 6.3 Refresh policy

- User-facing requests serve a cached recommendation set when it is fresh.
- Refresh when the library or rating history changes materially.
- Refresh candidate metadata after a defined TTL, initially seven days.
- Keep stale-but-valid recommendations available if IGDB is unavailable.
- Never block saving or editing the library on recommendation refresh work.

## 7. Data Model

Create a new Supabase migration rather than modifying an applied migration.

### 7.1 Extend `stageselect_games`

Add normalized recommendation metadata:

- `themes jsonb not null default '[]'`
- `keywords jsonb not null default '[]'`
- `game_modes jsonb not null default '[]'`
- `player_perspectives jsonb not null default '[]'`
- `similar_game_igdb_ids jsonb not null default '[]'`
- `total_rating numeric`
- `total_rating_count integer`
- `game_type integer` or the current IGDB game-type representation
- `recommendation_document text`
- `recommendation_document_hash text`

Continue storing the normalized raw response in `igdb_raw` for forward
compatibility, but do not make runtime ranking depend on untyped raw JSON.

### 7.2 Game embeddings

Use a separate table so embedding model changes are versioned rather than
overwriting an opaque column:

```text
stageselect_game_embeddings
  game_id uuid
  model text
  model_version text
  dimensions integer
  content_hash text
  embedding vector/halfvec
  status pending|ready|failed
  attempt_count integer
  error text nullable
  embedded_at timestamptz nullable
  created_at timestamptz
  updated_at timestamptz
```

The effective unique key is `(game_id, model, model_version)`. A content hash
prevents re-embedding unchanged metadata.

Use Supabase Postgres `pgvector`. Exact vector scans are sufficient while the
cache is small; add an HNSW index only after corpus size and query measurements
justify it. Avoid adopting Supabase Storage vector buckets for this feature
while that product remains alpha and the relational pgvector path is stable.

### 7.3 Recommendation feedback

```text
stageselect_recommendation_feedback
  id uuid
  user_id uuid
  game_id uuid
  recommendation_id uuid nullable
  action more_like_this|not_for_me|saved|dismissed
  created_at timestamptz
```

Direct feedback is append-only. Derived current preference can be computed from
the most recent relevant event or materialized later.

### 7.4 Impressions and recommendation runs

```text
stageselect_recommendation_runs
  id uuid
  user_id uuid
  model_version text
  surface play_next|discover
  controls jsonb
  candidate_count integer
  generated_at timestamptz
  expires_at timestamptz

stageselect_recommendation_impressions
  run_id uuid
  game_id uuid
  rank integer
  candidate_source text
  final_score numeric
  score_components jsonb
  explanation_evidence jsonb
  shown_at timestamptz
  acted_at timestamptz nullable
  action text nullable

stageselect_recommendation_outcomes
  impression_id uuid
  game_id uuid
  outcome saved|started|finished|left|rated
  rating numeric nullable
  attribution_method direct|recent_impression
  occurred_at timestamptz
```

These records make evaluation possible. Do not store raw private review text in
scores, logs, explanations, or analytics.

### 7.5 RLS and ownership

- Game metadata and game embeddings may be readable as shared catalogue data.
- Recommendation runs, impressions, feedback, outcomes, and derived user
  profiles are readable and writable only for their owner.
- Inserts should normally happen through authenticated server routes or
  security-definer RPCs with explicit ownership checks.
- Service credentials remain server-only.
- Export and account deletion must include user-owned recommendation data.

## 8. Embedding Pipeline

### Recommended production shape

Use an asynchronous pipeline rather than generating embeddings during a
recommendation request:

```text
Game metadata inserted/updated
        -> content hash changes
        -> embedding job queued
        -> worker/Edge Function generates embedding
        -> versioned vector stored
        -> failures retried with a cap
```

Supabase documents an automatic-embedding pattern using database triggers, a
queue, scheduled retries, and Edge Functions. A simpler first implementation
may use an explicit backfill script plus embedding-on-cache, but user-facing
requests should never wait for a large backfill.

### Model-provider decision gate

Keep a narrow provider interface:

```ts
type EmbeddingProvider = {
  model: string;
  version: string;
  dimensions: number;
  embed(inputs: string[]): Promise<number[][]>;
};
```

Evaluate at least:

- Supabase Edge Runtime's native `gte-small` option for an open model and no
  external embedding API.
- A hosted embedding API if operational simplicity or embedding quality is
  materially better.

Choose using a fixed StageSelect evaluation set, latency, cost per 1,000 cached
games, deployment complexity, and privacy—not benchmark reputation alone.

## 9. Application Architecture

### 9.1 Pure recommendation core

Create framework-independent modules under:

```text
frontend/lib/stageselect/recommendations/
  types.ts
  signals.ts
  profile.ts
  features.ts
  scoring.ts
  diversify.ts
  explanations.ts
  evaluation.ts
```

The modules accept typed data and contain no React, HTTP, Supabase, or IGDB
calls. This makes the mathematics deterministic and unit-testable.

### 9.2 IGDB client changes

Extend `frontend/lib/igdb/types.ts` and `frontend/lib/igdb/client.ts` to fetch
and normalize:

- Themes and keywords.
- Game modes and optionally player perspectives.
- Similar game IDs.
- Aggregate rating and count.
- The non-deprecated game type field.

Split search and recommendation hydration into separate functions. Search has a
small, relevance-sorted response; recommendation hydration works efficiently
with batches of known IDs.

### 9.3 Server routes

Proposed routes:

```text
GET  /api/projects/stageselect/recommendations
POST /api/projects/stageselect/recommendations/feedback
POST /api/projects/stageselect/recommendations/refresh
GET  /api/projects/stageselect/taste-profile
```

`GET recommendations` accepts validated values for surface, platform, and
adventure level. It returns display data, explanation text, a recommendation
run ID, and opaque recommendation item IDs. Do not expose private raw feature
vectors or other users' information.

The refresh route should be idempotent and rate-limited. It may return cached
results while background enrichment continues.

### 9.4 Frontend refactor

`StageSelectApp.tsx` is already large. Before adding recommendation UI, extract at least:

```text
components/StageSelectTabs.tsx
components/RecommendationCard.tsx
components/RecommendationsPanel.tsx
components/TasteDnaPanel.tsx
hooks/useStageSelectRecommendations.ts
```

Keep shared types in the library layer. This refactor is part of the feature,
not an unrelated redesign.

## 10. Explainability Design

An explanation is a user-facing projection of actual score components.

Store evidence such as:

```json
{
  "seedGames": [{ "igdbId": 114795, "title": "Hades", "weight": 1.5 }],
  "matchedFacets": ["Roguelike", "Action"],
  "platformMatch": "Nintendo Switch",
  "noveltyReason": "underrepresented_theme",
  "candidateSource": "similar_games"
}
```

Explanation templates then select the strongest non-redundant evidence. Tests
must assert that every stated reason corresponds to stored evidence. Avoid
causal language: the system can say “this matched,” not “you will love this.”

Provide a compact `Why this?` disclosure with:

- Positive evidence.
- Any exploration/diversity reason.
- A one-click correction action.

## 11. Evaluation Plan

### 11.1 Baselines

Every semantic model must beat useful non-ML baselines:

1. Popular games on a compatible platform.
2. Genre-overlap ranking.
3. Structured content score without embeddings.
4. Semantic similarity without hybrid features or diversity.

### 11.2 Offline evaluation

Use per-user temporal or leave-one-out evaluation. For users with enough rated
games:

1. Hide one or more later positive games.
2. Build the profile from earlier visible history.
3. Rank the hidden game among sampled or full candidates.
4. Repeat across eligible users and folds.

Track:

- `Recall@K`: did the hidden relevant game appear?
- `NDCG@K`: did relevant games appear near the top?
- `MRR`: where did the first relevant game appear?
- Catalogue coverage: how much of the candidate set can be recommended?
- Intra-list diversity: how different are the final recommendations?
- Novelty: how non-obvious are they, without rewarding obscurity alone?
- Platform eligibility rate and duplicate/exclusion violations.

Do not treat rating RMSE as the primary metric. The feature presents a ranked list,
so ranking metrics better represent the product behavior.

### 11.3 Small-data development set

Before sufficient production data exists, create a versioned fixture of
synthetic taste profiles and expected relationships:

- Single-genre specialist.
- Two-cluster user.
- Contrarian low rater.
- New user with only wishlist entries.
- User with strong negative feedback.
- Platform-restricted user.

Use it for regression tests, not as evidence of real-world model quality.

### 11.4 Online signals

Track by model version and surface:

- Recommendation save rate.
- `More like this` and `Not for me` rates.
- Downstream start rate, when status later becomes `playing`.
- Downstream completion and rating, with a long attribution window.
- Refresh frequency and repeated-recommendation fatigue.
- Latency, cache hit rate, enrichment failures, and embedding coverage.

Clicks alone are weak evidence. Saving, starting, finishing, and rating are
progressively stronger but slower signals.

### 11.5 Guardrails

- No already-owned game in Discover.
- No rejected game before rejection expiry.
- No explanation without matching evidence.
- No cross-user data exposure.
- Stable output for identical inputs and model version, except explicitly
  controlled exploration.
- Graceful degradation when embeddings or IGDB are unavailable.

## 12. Testing Strategy

### Unit tests

- Signal-to-weight conversion.
- Per-user rating centering.
- Positive and negative centroid construction.
- Cosine and structured similarity.
- Feature normalization and hybrid score.
- MMR ordering and its relevance/diversity extremes.
- Platform filtering and library exclusions.
- Multi-interest profile behavior.
- Explanation/evidence consistency.

### Integration tests

- Authenticated route ownership.
- RLS for feedback, runs, impressions, and profiles.
- Candidate hydration and deduplication.
- Cache hit, stale-cache, IGDB failure, and partial embedding states.
- Feedback changes subsequent ranking.
- Export includes user-owned recommendation records.

### End-to-end tests

- Cold-start prompt.
- Play Next with only local-library candidates.
- Discover generation, save action, and feedback action.
- Familiar/Adventurous control visibly changes diversity.
- Keyboard and mobile behavior.
- Loading, empty, partial, and failure states.

### Performance tests

- p50/p95 response latency with cached candidates.
- Exact vector scan versus HNSW at realistic catalogue sizes.
- Embedding queue throughput, retries, and poison-job behavior.
- IGDB request batching under documented rate limits.

## 13. Delivery Phases

### Phase 0 — Measurement contract and refactor

- Define recommendation response, evidence, feedback, and model-version types.
- Add deterministic fixtures and baseline evaluation harness.
- Extract the relevant StageSelect UI components.
- Add recommendation run and feedback tables with RLS.

**Exit criterion:** baselines run reproducibly; UI refactor does not change
existing Search, Library, or Stats behavior.

### Phase 1 — Play Next structured baseline

- Build user signals from current library rows and ratings.
- Rank backlog/wishlist/playing games using structured metadata.
- Add Recommendations tab, explanations, controls, and feedback.
- Log versioned runs and impressions.

**Exit criterion:** useful recommendations work without embeddings or new IGDB
calls, and every explanation is evidence-backed.

### Phase 2 — Metadata enrichment and Discover

- Extend IGDB normalization and database fields.
- Add similar-game and preference-facet candidate generation.
- Batch hydration, caching, TTLs, and adult/version filtering.
- Add Discover lane with graceful cached fallback.

**Exit criterion:** Discover produces a deduplicated, platform-aware candidate
pool without violating IGDB limits.

### Phase 3 — Semantic embeddings

- Enable pgvector and add the versioned embedding table.
- Implement provider interface, backfill, queueing, retries, and coverage
  monitoring.
- Add semantic similarity to the hybrid score.
- Compare it with all baselines on the fixed evaluation set.

**Exit criterion:** embeddings improve at least one declared ranking metric or a
documented qualitative blind evaluation without unacceptable regressions.
Otherwise keep the simpler structured model in production.

### Phase 4 — Diversity and Preference profile

- Add MMR and connect it to Familiar/Adventurous.
- Add bounded multi-interest clustering.
- Build Preference profile from the same model artifacts.
- Add cluster-level explanations and confidence states.

**Exit criterion:** diversity improves without a material relevance collapse,
and every displayed taste has supporting games.

### Phase 5 — Learning and experimentation

- Accumulate clean feedback and downstream outcomes. The first outcome schema,
  direct-save linkage, and bounded delayed attribution are implemented.
- Analyze feature usefulness and bias. A first maturity-aware outcome report is
  implemented; feature-level and cohort bias analysis still requires enough
  organic data.
- Train a simple regularized linear or tree-based ranker if data volume is
  sufficient.
- Run a model-version experiment with guardrails.
- Consider a contextual bandit only after counterfactual evaluation and
  exploration safety are understood.

**Exit criterion:** a learned model is adopted only when it reliably beats the
hand-tuned hybrid ranker on offline metrics and product guardrails.

## 14. Operational Concerns

### Versioning and reproducibility

Every run records:

- Ranker version.
- Embedding model and version.
- Feature-schema version.
- Candidate-generation version.
- Control values.

Weights live in a versioned TypeScript configuration rather than scattered
magic numbers.

### Failure behavior

- Missing embedding: use structured scoring.
- Embedding provider unavailable: queue/retry; do not fail the library.
- IGDB unavailable: serve fresh-enough cached results.
- Too few candidates: relax soft preferences, never permissions or explicit
  filters.
- Corrupt vector or dimension mismatch: quarantine it and report telemetry.

### Cost controls

- Embed catalogue games once per content hash, not once per user.
- Batch embedding requests.
- Cache recommendation runs.
- Do not embed private reviews in the default pipeline.
- Measure cost per newly cached game and per recommendation refresh.

### Privacy

- Describe clearly which library signals affect recommendations.
- Let the user clear recommendation feedback and reset their taste profile.
- Keep private reviews out of third-party model calls by default.
- Include feedback, impressions, and any stored derived profile in data export
  and deletion flows.
- Never use one user's private behavior to explain another user's result.

## 15. Resume and Portfolio Deliverables

To make the work demonstrable rather than merely claimable, retain:

- An architecture diagram of retrieval, ranking, reranking, and serving.
- A short model card documenting intended use, signals, exclusions, limitations,
  privacy, and evaluation results.
- A reproducible evaluation command and a small anonymized/synthetic fixture.
- A before/after table comparing baselines and model versions.
- Screenshots or a short recording of cold start, explanation, controls, and
  feedback adaptation.
- An operational dashboard or structured log sample for latency, embedding
  coverage, and feedback.
- A concise technical write-up explaining why content-based recommendation was
  selected over collaborative filtering at this scale.

Potential resume bullet after implementation and measurement:

> Built an explainable two-stage game recommender in Next.js and Supabase,
> combining semantic embeddings, personalized content features, negative
> feedback, and MMR diversity reranking; versioned model runs and evaluated
> ranking quality with Recall@K, NDCG@K, coverage, and intra-list diversity.

Do not add performance numbers until they have been measured reproducibly.

## 16. Open Decisions Before Phase 3

The first two phases can proceed without resolving these:

1. Embedding runtime: Supabase Edge native model or hosted provider.
2. Exact embedding dimension and storage type (`vector` versus `halfvec`).
3. Minimum library size for multi-interest clustering.
4. Rejection expiry: permanent until reset, or eligible again after a long
   interval.
5. Recommendation-run TTL and refresh rate.
6. Whether anonymous aggregate telemetry is desirable; default is user-owned
   operational data only.

## 17. Definition of Done

The recommendation work is complete when:

- A signed-in user can receive Play Next and Discover recommendations.
- Cold-start and insufficient-data states are honest and useful.
- Results are personalized, diversified, platform-aware, and deduplicated.
- Every explanation is derived from stored ranking evidence.
- Direct feedback changes future results.
- The system remains usable if semantic embeddings or IGDB are temporarily
  unavailable.
- RLS and export/deletion behavior cover all user-owned recommendation data.
- Baselines and the selected model have reproducible evaluation results.
- Model and embedding versions are visible in internal diagnostics.
- Existing StageSelect search, save, edit, export, library, and stats flows
  continue to pass their test plan.

## 18. References

- [IGDB API documentation](https://api-docs.igdb.com/) — available game fields,
  query syntax, content filters, and request limits.
- [Supabase semantic search documentation](https://supabase.com/docs/guides/ai/semantic-search)
  — pgvector storage, cosine/inner-product search, metadata filtering, and index
  options.
- [Supabase automatic embeddings documentation](https://supabase.com/docs/guides/ai/automatic-embeddings)
  — asynchronous embedding generation, queues, retries, and Edge Functions.
- [Carbonell and Goldstein, “The Use of MMR, Diversity-Based Reranking for
  Reordering Documents and Producing Summaries”](https://aclanthology.org/X98-1025/)
  — the relevance/diversity reranking principle used for the final list.
- [Vargas and Castells, “Rank and Relevance in Novelty and Diversity Metrics for
  Recommender Systems”](https://dl.acm.org/doi/10.1145/2467696.2467711) — framing
  novelty and diversity as recommendation-quality dimensions.
