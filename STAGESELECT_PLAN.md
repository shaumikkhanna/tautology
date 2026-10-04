# StageSelect Project Plan

## Summary

StageSelect is now a working early-stage game library project inside the existing Next.js frontend. Users can sign up or log in with Supabase Auth, search IGDB through a server-side route, save games to their account, rate/review selected statuses, manage their library, and export their user-owned library data.

Status: the original library chapter is complete. The StageSelect Recommendations
expansion specified in `STAGESELECT_RECOMMENDATIONS_PLAN.md` is now in implementation;
its structured Play Next and outside-library Discover phases are active.

## Next Expansion: StageSelect Recommendations

`STAGESELECT_RECOMMENDATIONS_PLAN.md` specifies a private, explainable game recommender
with Play Next and Discover surfaces, Preference profile, structured and semantic game
representations, negative feedback, hybrid ranking, MMR diversity, offline
evaluation, model versioning, privacy controls, and a phased delivery plan.

Treat that document as the source of truth for recommendation work. The phases
intentionally begin with a measurable structured baseline before adding
semantic embeddings.

The app lives at:

```txt
frontend/app/projects/stageselect/
```

The project card lives at:

```txt
frontend/content/projects/stageselect/meta.json
```

## Finished

- Added root planning file and project card.
- Added dedicated StageSelect route and modern neutral app styling.
- Configured Supabase with publishable-key based browser auth.
- Added Supabase signup, login, logout, and session detection.
- Added Supabase migrations for:
  - profiles
  - cached IGDB games
  - user game library rows
  - reviews
  - review/status enums
  - RLS policies
  - user-selected platform per library row
- Added server-side IGDB search at `GET /api/projects/stageselect/search?q=...`.
- Added Twitch/IGDB token fetching with in-memory token caching.
- Normalized IGDB search results for the frontend.
- Added local relevance/popularity ranking for search results.
- Split the app into Search and Library tabs.
- Added Stats tab with simple local dashboard charts by platform, status, and rating.
- Added game save flows:
  - `finished`, `left`, `playing`, and `backlogged` require platform and can include optional rating/review.
  - `wishlisted` requires platform and saves without rating/review.
- Added library card grid with cover art.
- Added library text search across titles, platforms, statuses, years, and review text.
- Added colored status and platform chips.
- Added library detail/edit modal:
  - view existing review
  - edit status
  - edit platform
  - edit rating
  - edit review
  - remove game from library
- Search results for games already in the user's library open the existing library edit modal instead of starting a duplicate add flow.
- Added server-side save/update/remove routes so write flows no longer write directly to Supabase tables from the browser.
- Added optional Supabase Object Storage cover caching in the server-side save route.
- Added email confirmation redirects back to `/projects/stageselect` on the current deployed origin.
- Changed library edit platform control from free text to a dropdown based on cached IGDB platform data.
- Added typed Supabase database definitions and typed Supabase clients.
- Added incremental library rendering pagination so large filtered libraries render in manageable chunks.
- Added authenticated JSON export for user-owned StageSelect data:
  - IGDB ids
  - statuses
  - selected platforms
  - dates
  - ratings/reviews
  - recommendation feedback history
- Started StageSelect Recommendations with a structured Play Next recommender, Preference profile,
  evidence-backed explanations, adjustable diversity, and persistent reversible
  `More like this` / `Not for me` feedback.
- Added Discover for games outside the library by merging IGDB related-game
  candidates with batched genre, theme, mode, perspective, and keyword
  retrieval; candidates are deduplicated before structured ranking, platform
  filtering, diversity reranking, and wishlist handoff.
- Split Recommendations into Play Next and Discover sub-tabs, moved preference
  feedback to Discover, and added persistent neutral dismissal with undo.
- Added private, versioned recommendation-run and impression logging for Play
  Next and Discover, including controls, retrieval source, rank, score
  components, explanation evidence, and feedback attribution. The data is
  protected by RLS and included in the account export without review text.
- Added private downstream outcome measurement for recommended games: direct
  Discover saves plus later starts, finishes, abandons, and ratings attributed
  within a bounded 90-day window. Outcomes are included in account exports and
  do not block library operations if measurement fails.
- Added a versioned export-based outcome evaluator with maturity-aware
  denominators, per-model and per-surface funnels, Wilson intervals, sample-size
  guardrails, and orphan/duplicate data-quality checks.
- Added a deterministic recommendation evaluation command with six synthetic
  taste profiles, popularity/genre/structured/diversified comparisons, ranking
  and catalogue metrics, guardrail checks, JSON output, and a documented
  baseline for future model changes.
- Added the semantic representation foundation: canonical metadata documents,
  content hashes, a versioned 384-dimensional pgvector table, pending-job
  triggers, atomic retryable job claiming, a server-only `gte-small` Edge
  Function worker, a workload-aware five-minute schedule, and a dry-run-first
  backfill command. Semantic similarity is not part of production ranking until
  it clears the evaluation gate.
- Added a signed-in account action to download that JSON export.
- Collapsed the library modal review editor behind an edit/add review toggle.

## Current Files

Important frontend files:

```txt
frontend/app/projects/stageselect/page.tsx
frontend/app/projects/stageselect/StageSelectApp.tsx
frontend/app/projects/stageselect/RecommendationsPanel.tsx
frontend/app/api/projects/stageselect/search/route.ts
frontend/app/api/projects/stageselect/export/route.ts
frontend/app/api/projects/stageselect/library/route.ts
frontend/app/api/projects/stageselect/library/[userGameId]/route.ts
frontend/app/api/projects/stageselect/recommendations/feedback/route.ts
frontend/app/api/projects/stageselect/recommendations/discover/route.ts
frontend/app/api/projects/stageselect/recommendations/runs/route.ts
frontend/lib/igdb/client.ts
frontend/lib/igdb/types.ts
frontend/lib/supabase/client.ts
frontend/lib/supabase/database.types.ts
frontend/lib/supabase/server.ts
frontend/lib/stageselect/api.ts
frontend/lib/stageselect/recommendations/
frontend/lib/stageselect/recommendations/EVALUATION.md
frontend/lib/stageselect/recommendations/SEMANTIC_EMBEDDINGS.md
frontend/scripts/evaluate-stageselect-recommendations.mjs
frontend/scripts/backfill-stageselect-recommendation-documents.mjs
frontend/scripts/process-stageselect-embeddings.mjs
frontend/scripts/configure-stageselect-embedding-schedule.mjs
frontend/lib/stageselect/storage.ts
frontend/content/projects/stageselect/meta.json
```

Supabase migrations:

```txt
supabase/migrations/20260511000000_stageselect_schema.sql
supabase/migrations/20260511001000_stageselect_game_cache_policies.sql
supabase/migrations/20260511002000_stageselect_user_game_platform.sql
supabase/migrations/20260511003000_stageselect_storage_bucket.sql
supabase/migrations/20260511004000_stageselect_cover_storage_path.sql
supabase/migrations/20260921001000_stageselect_recommendation_feedback.sql
supabase/migrations/20260921002000_stageselect_recommendation_metadata.sql
supabase/migrations/20260922000000_stageselect_recommendation_runs.sql
supabase/migrations/20260922001000_stageselect_game_embeddings.sql
supabase/migrations/20260922002000_stageselect_embedding_schedule.sql
supabase/functions/stageselect-embed-games/index.ts
```

Local env shape:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
STAGESELECT_STORAGE_BUCKET=stageselect-game-images
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
```

`frontend/.env.local` is ignored. Do not commit credentials. `SUPABASE_SECRET_KEY` must stay server-only and must not be exposed with a `NEXT_PUBLIC_` prefix. Rotate the IGDB client secret before production because it was shared during development.

## Current Data Model

`profiles`

- One row per Supabase auth user.
- Auto-created by trigger on auth user creation.

`stageselect_games`

- Local cache of selected IGDB game metadata.
- Stores IGDB id, title, slug, summary, cover URL, cover storage path, release
  date, platforms, genres, themes, keywords, modes, perspectives, similar-game
  ids, aggregate rating data, game type, raw normalized payload, and sync time.

`stageselect_user_games`

- Per-user library row.
- Stores user id, game id, status, selected platform, optional start/finish dates, and timestamps.
- Unique per user/game.

`stageselect_reviews`

- Per-user review row.
- Stores rating, body, visibility, and timestamps.
- Unique per user/game.
- Current UI stores private reviews only.

`stageselect_recommendation_feedback`

- Private recommendation feedback events owned by the user.
- Discover records `more_like_this`, `not_for_me`, and the neutral `dismissed`
  action. Feedback can reference the exact impression that prompted it.
- Repeating an active action clears that game's feedback, and hidden Play Next
  picks remain available in an Undo list.

`stageselect_recommendation_runs` and `stageselect_recommendation_impressions`

- Private, user-owned measurement records for the recommendation version,
  surface, controls, candidate count, shown order, source, scores, and
  structured explanation evidence.
- Impressions may record the action and timestamp that followed a shown item;
  current preference state is derived from the latest remaining feedback event.

`stageselect_game_embeddings`

- Server-managed, versioned vectors for shared cached game metadata.
- Tracks the document/model versions, content hash, dimensions, processing
  status, retry count, errors, and completion timestamps.
- Metadata changes queue a fresh vector and make stale worker results harmless.
- `20260923000000_stageselect_semantic_ranking.sql` exposes only authenticated,
  user-specific similarity summaries for hybrid ranking; stored vectors remain
  server-only.

## Parked Future Work

None of this is pressing for the current private/early StageSelect app. Revisit only when expanding the product or preparing a public launch.

- Add Apple login through Supabase Auth.
- Add public/private review controls and public game detail pages.
- Add richer game detail pages for cached games.
- Add richer visualizations powered by the same user-owned data shape as the JSON export.
- Add better search filtering, including hiding adult/low-quality edge results if needed.
- Add optimistic UI and toast notifications for save/update/remove actions.
- Add tests for IGDB normalization/ranking and core save/update flows.
- Add production deployment env docs for Vercel/Supabase.
- Configure custom SMTP before public launch to avoid Supabase's very low built-in email rate limits.
- Rotate the IGDB client secret before any production/public launch because it was shared during development.

## Test Plan

- `npm run build` should pass from `frontend/`.
- `npm run test:stageselect-recommendations` should keep the versioned ranking
  baseline and recommendation unit tests green.
- `npm run evaluate:stageselect-recommendations` should reproduce the documented
  metric table with full platform eligibility and zero guardrail violations.
- `npm run backfill:stageselect-recommendation-documents` should report the
  existing-cache change count without writing unless `--write` is supplied.
- `/projects` should show the StageSelect card.
- `/projects/stageselect` should load the app.
- Signup/login/logout should work with Supabase.
- Email confirmation should redirect back to `/projects/stageselect` on the same deployed origin.
- Search should return IGDB results through `/api/projects/stageselect/search`.
- Save/update/remove should run through `/api/projects/stageselect/library` routes.
- Saving a game should create/reuse a cached `stageselect_games` row.
- Saving a game should cache the cover in Supabase Object Storage when `SUPABASE_SECRET_KEY` and the storage bucket are configured.
- Saving a status should create/update the user’s `stageselect_user_games` row.
- Saving with rating/review should create/update `stageselect_reviews`.
- Wishlist should require platform and save without rating/review.
- Stats should summarize the current library by platform, status, and rating.
- Library filters/sorting should work after saved games exist.
- Editing/removing from the library modal should persist.
- Download JSON should export only user-owned StageSelect data, using IGDB ids instead of cached game metadata.

## Assumptions

- StageSelect remains inside the existing Next.js frontend.
- Supabase handles auth and relational app data.
- IGDB calls remain server-side.
- Supabase Object Storage handles cached game images through the server-side save route when configured.
- Ratings are stored as 0.5 to 5.0 stars in 0.5 increments.
