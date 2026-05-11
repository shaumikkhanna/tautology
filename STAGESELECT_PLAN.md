# StageSelect Project Plan

## Summary

StageSelect is now a working early-stage game library project inside the existing Next.js frontend. Users can sign up or log in with Supabase Auth, search IGDB through a server-side route, save games to their account, rate/review selected statuses, and manage their library.

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
- Added game save flows:
  - `finished`, `left`, `playing`, and `backlogged` require platform and can include optional rating/review.
  - `wishlisted` saves immediately without rating/review.
- Added library card grid with cover art.
- Added colored status and platform chips.
- Added library detail/edit modal:
  - view existing review
  - edit status
  - edit platform
  - edit rating
  - edit review
  - remove game from library
- Added server-side save/update/remove routes so write flows no longer write directly to Supabase tables from the browser.
- Added optional Supabase Object Storage cover caching in the server-side save route.

## Current Files

Important frontend files:

```txt
frontend/app/projects/stageselect/page.tsx
frontend/app/projects/stageselect/StageSelectApp.tsx
frontend/app/api/projects/stageselect/search/route.ts
frontend/app/api/projects/stageselect/library/route.ts
frontend/app/api/projects/stageselect/library/[userGameId]/route.ts
frontend/lib/igdb/client.ts
frontend/lib/igdb/types.ts
frontend/lib/supabase/client.ts
frontend/lib/supabase/server.ts
frontend/lib/stageselect/api.ts
frontend/lib/stageselect/storage.ts
frontend/content/projects/stageselect/meta.json
```

Supabase migrations:

```txt
supabase/migrations/20260511000000_stageselect_schema.sql
supabase/migrations/20260511001000_stageselect_game_cache_policies.sql
supabase/migrations/20260511002000_stageselect_user_game_platform.sql
supabase/migrations/20260511003000_stageselect_storage_bucket.sql
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
- Stores IGDB id, title, slug, summary, cover URL, release date, platforms, genres, raw normalized payload, and sync time.

`stageselect_user_games`

- Per-user library row.
- Stores user id, game id, status, selected platform, optional start/finish dates, and timestamps.
- Unique per user/game.

`stageselect_reviews`

- Per-user review row.
- Stores rating, body, visibility, and timestamps.
- Unique per user/game.
- Current UI stores private reviews only.

## Remaining Work

- Apply the Supabase Object Storage bucket migration in production and confirm saved games prefer cached cover/image URLs after save.
- Add typed Supabase database definitions instead of local ad hoc response types.
- Add Apple login through Supabase Auth.
- Add public/private review controls and public game detail pages.
- Add richer game detail pages for cached games.
- Add better search filtering, including hiding adult/low-quality edge results if needed.
- Add optimistic UI and toast notifications for save/update/remove actions.
- Add pagination or virtualized loading for large libraries.
- Add tests for IGDB normalization/ranking and core save/update flows.
- Add production deployment env docs for Vercel/Supabase.

## Test Plan

- `npm run build` should pass from `frontend/`.
- `/projects` should show the StageSelect card.
- `/projects/stageselect` should load the app.
- Signup/login/logout should work with Supabase.
- Search should return IGDB results through `/api/projects/stageselect/search`.
- Save/update/remove should run through `/api/projects/stageselect/library` routes.
- Saving a game should create/reuse a cached `stageselect_games` row.
- Saving a game should cache the cover in Supabase Object Storage when `SUPABASE_SECRET_KEY` and the storage bucket are configured.
- Saving a status should create/update the user’s `stageselect_user_games` row.
- Saving with rating/review should create/update `stageselect_reviews`.
- Wishlist should save without rating/review.
- Library filters/sorting should work after saved games exist.
- Editing/removing from the library modal should persist.

## Assumptions

- StageSelect remains inside the existing Next.js frontend.
- Supabase handles auth and relational app data.
- IGDB calls remain server-side.
- Supabase Object Storage handles cached game images through the server-side save route when configured.
- Ratings are stored as 0.5 to 5.0 stars in 0.5 increments.
