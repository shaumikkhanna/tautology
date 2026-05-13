# Cryptic Crossword Archive Plan

## Summary

Cryptic Crossword Archive is now a working first version inside the Next.js frontend. It is a gated `/play/...` game/subapp, listed from the normal Games section card flow, with Supabase auth, admin/invite approval, a repo-backed crossword archive, a playable barred crossword grid, autosaved progress, solve stats, and post-solve answer reasonings.

Status: working v1 with real archive entries. The core path is in place; future work is mostly mobile QA, save-failure UX, puzzle-authoring scale, and richer solve analytics.

## Current User Flow

1. User opens `/games/cryptic-crossword-archive`.
2. User clicks Play and lands at `/play/games/cryptic-crossword-archive`.
3. If signed out, user sees email/password login and signup.
4. If the URL has `?invite=CODE`, the app redeems the invite after signup/login.
5. If signed in but not approved, user sees an access-pending screen.
6. Once approved through admin/invite/Supabase, user can click `Check again` or refresh.
7. Approved users see the archive card grid, solved/perfect stats, perfect-solve timing, flags, and any saved progress.
8. Opening a puzzle starts/resumes the solve timer and grid state.
9. User can type, move around divider-aware, check/reveal letter/word/grid, reset progress, and complete the puzzle.
10. Completion shows a solve summary and unlocks all clue reasonings.

## Finished

- Added Games card metadata:
  - `frontend/content/games/cryptic-crossword-archive/meta.json`
- Added isolated play route:
  - `frontend/app/play/games/cryptic-crossword-archive/page.tsx`
  - `frontend/app/play/games/cryptic-crossword-archive/CrypticCrosswordArchiveApp.tsx`
  - `frontend/app/play/games/cryptic-crossword-archive/crypticCrossword.module.css`
- Added bundled crossword archive data:
  - `frontend/content/crosswords/archive.json`
- Added crossword helpers:
  - `frontend/lib/crosswords/archive.ts`
  - `frontend/lib/crosswords/server.ts`
  - `frontend/lib/crosswords/types.ts`
- Added API routes:
  - `GET /api/games/crosswords/access`
  - `GET /api/games/crosswords/archive`
  - `GET /api/games/crosswords/archive/[crosswordId]`
  - `POST /api/games/crosswords/invites/redeem`
  - `GET /api/games/crosswords/progress`
  - `PUT /api/games/crosswords/progress/[crosswordId]`
  - `DELETE /api/games/crosswords/progress/[crosswordId]`
  - `GET /api/admin/crosswords`
  - `POST /api/admin/crosswords/approvals`
  - `POST /api/admin/crosswords/invites`
- Added Supabase migration:
  - `supabase/migrations/20260512000000_crossword_archive.sql`
  - `supabase/migrations/20260513000000_crossword_invites.sql`
- Added local Supabase TypeScript table definitions for:
  - `crossword_approvals`
  - `crossword_invites`
  - `crossword_progress`
- Added gated access:
  - API routes require Supabase bearer token.
  - Archive/progress routes require a `crossword_approvals` row with `approved_at`.
  - Users cannot approve themselves through RLS policies.
- Added approval UX:
  - Signed-in unapproved users see pending state.
  - Pending state has `Check again` for after admin approval or invite redemption.
- Added account UX:
  - Header shows signed-in email.
  - Log out clears local session/archive/player state immediately.
  - Safari focus/auth refresh no longer re-runs access checks for the same user.
- Added player behavior:
  - 10x8 barred grid rendering from JSON rows/cols.
  - Black cell support.
  - Numbered cell support.
  - Bold divider support between adjacent cells.
  - Across/down clue lists, side-by-side independently scrollable on desktop.
  - Selected cell and active entry highlighting.
  - Filled clue dimming.
  - Incorrect checked cell highlighting.
  - Typing, backspace/delete, space direction toggle, tab clue navigation, divider-aware arrow-key navigation, and clue click navigation.
  - Timer.
  - Check letter/word/grid.
  - Reveal letter/word/grid.
  - Reset puzzle deletes the user's progress row and removes it from stats.
  - Completion detection.
  - Solve summary and reasonings after completion.
  - Check/reveal controls disable after completion so perfect status cannot be ruined afterward.
- Added local development helper:
  - `Open local dev archive` button appears only in development on `localhost`, `127.0.0.1`, or `::1`.
  - Dev progress is stored in `localStorage`.
- Added autosave:
  - Debounced save after grid/check/reveal/completion changes.
  - Timer persistence every 15 seconds while solving.
  - Stats update after saved progress returns from the server.
- Added server-side perfect derivation:
  - `perfect = completed_at exists && checked_count === 0 && revealed_count === 0`.
- Added archive stats:
  - `solvedCount` counts all completed puzzles, including aided solves.
  - `perfectCount`, average time, and standard deviation use only perfect solves.
- Added admin/invite flow:
  - Admin page: `/admin/crosswords`.
  - Invite links use `/play/games/cryptic-crossword-archive?invite=CODE`.
  - Required env: `SUPABASE_SECRET_KEY` and `CROSSWORD_ADMIN_EMAILS=admin@example.com`.
- Added archive authoring scripts:
  - `npm run import:crosswords`
  - `npm run validate:crosswords`

## Data Model

`crossword_approvals`

- One row per approved user.
- Primary key: `user_id`.
- Fields:
  - `user_id`
  - `email`
  - `approved_at`
  - `notes`
  - timestamps
- RLS:
  - Authenticated users can read only their own approval row.
  - No browser-facing insert/update/delete policies.
- Manual approval is done from Supabase dashboard/SQL editor.
- Admin approval can also be done from `/admin/crosswords` when the signed-in admin email is listed in `CROSSWORD_ADMIN_EMAILS`.

Approval SQL:

```sql
insert into public.crossword_approvals (user_id, email, approved_at)
values (
  'USER_ID_HERE',
  'user@example.com',
  now()
)
on conflict (user_id)
do update
set approved_at = excluded.approved_at,
    email = excluded.email;
```

`crossword_invites`

- One row per invite code.
- Fields:
  - `code`
  - `email` optional, for single-email invites
  - `created_by`
  - `used_by`
  - `expires_at`
  - `used_at`
  - `notes`
  - timestamps
- RLS:
  - Enabled, with no browser-facing policies. Admin API routes use the service role.
- Redemption:
  - User opens invite link, signs up/logs in, then the app calls the redeem API.
  - Valid invites create/update the user approval row automatically.

`crossword_progress`

- One row per `(user_id, crossword_id)`.
- Stores:
  - `grid_state` JSON object keyed by `"row,col"`.
  - `elapsed_seconds`.
  - `checked_count`.
  - `revealed_count`.
  - `completed_at`.
  - `perfect`.
  - timestamps.
- RLS:
  - Users can read/create/update/delete only their own progress.

## Crossword JSON Shape

Archive file:

```txt
frontend/content/crosswords/archive.json
```

Each puzzle contains:

- `id`: stable string id used by progress rows.
- `title`.
- `rows`, `cols`.
- `blackCells`: `{ row, col }`.
- `numberedCells`: `{ row, col, number }`.
- `dividers`: adjacent cell pairs `{ from, to }`; currently rendered as bold right/bottom cell borders.
- `clues.across` and `clues.down`.

Each clue contains:

- `id`: stable clue id such as `1a`.
- `number`.
- `direction`: `across` or `down`.
- `start`: `{ row, col }`.
- `clue`.
- `answer`.
- `reasoning`.

Important authoring rules:

- Coordinates are zero-based.
- Answers must agree at all crossing cells.
- A clue answer length determines the occupied cells from its start coordinate.
- Answers are normalized client-side to uppercase letters/numbers for grid logic.
- Puzzle ids should never be changed after users start solving, because progress rows key off `crossword_id`.

## Current Limitations

- The archive currently has three real 10x8 barred crossword entries imported from `all_crosswords.json`.
- There is no admin UI for adding puzzles.
- The player does not yet support rebus/multi-character cells.
- Check/reveal counts are puzzle-level, not per-cell or per-clue audit trails.
- In-progress timer persistence is debounced, so closing the tab can lose up to about 15 seconds.
- Answers/reasonings are sent to approved clients; this was accepted because inspection resistance is not a priority.
- Mobile QA still needs a dedicated pass on real devices/browser sizes.
- Admin invite creation requires `SUPABASE_SECRET_KEY` and `CROSSWORD_ADMIN_EMAILS` in the deployed environment.

## Future Work

- Add a compact authoring guide if puzzle sources expand beyond `all_crosswords.json`.
- Add save failure/retry UI for autosave.
- Mobile viewport QA and polish.
- Add richer stats:
  - best time per puzzle
  - average time by puzzle
  - streaks
  - check/reveal rates
  - solve history timeline
- Add resume affordance from archive list for in-progress puzzles.
- Consider extracting shared Supabase auth UI with StageSelect if more gated apps appear.

## Test Plan

Run from `frontend/`:

```txt
npm run validate:crosswords
npx next build --webpack
```

Manual checks:

- `/games` shows the Cryptic Crossword Archive card.
- Card detail page opens and Play navigates to `/play/games/cryptic-crossword-archive`.
- Signed-out state shows login/signup.
- Login works with existing Supabase account.
- Signed-in unapproved state shows access pending.
- Admin approval in `/admin/crosswords` unlocks access after `Check again`.
- Invite links redeem after signup/login and unlock access.
- Signed-in approved state shows archive list and stats.
- Opening a real puzzle restores saved state if present.
- Grid accepts typing and respects divider bars for movement.
- Backspace/delete clears letters.
- Arrow keys move selection.
- Space toggles across/down.
- Tab moves to the next clue.
- Clicking a clue selects its first cell and direction.
- Check letter/word/grid increments check count and shows feedback.
- Wrong checked letters are tinted.
- Reveal letter/word/grid increments reveal count and fills answers.
- Reset puzzle clears saved progress and removes it from stats.
- Perfect solve is true only when completed with zero checks and zero reveals.
- Log out returns to signed-out UI and clears local puzzle state.
- Switching macOS spaces/Safari focus does not repeatedly show "Checking crossword access..." for the same signed-in user.

## Parking Notes

The current implementation is push-ready for an invite-gated crossword archive. The next meaningful milestone is a mobile QA pass plus save-failure UX before broader sharing.
