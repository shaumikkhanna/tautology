# Tautology Project Overview

This file is the handoff map for future Codex chats. Read it before making structural changes.

## Goal

Tautology is being migrated from a small Flask/static-games site into a monorepo with:

- `frontend/`: Next.js + Tailwind app for Vercel.
- `backend/`: FastAPI service for Render.

The frontend should feel like a clean modern version of old basic HTML/JS pages: beige paper, dark ink, mono labels, spare layout, and light retro interaction. Games/apps themselves should stay visually isolated once opened.

## Repository Shape

```txt
tautology_new/
  .git/
  PROJECT_OVERVIEW.md
  backend/
  frontend/
  starnim/        # original Flask Starnim source, kept as source/reference
```

The Git repo is rooted at `tautology_new/`, not inside `frontend/`. Do not commit unless the user explicitly asks.

Generated/local folders such as `frontend/.next/`, `frontend/node_modules/`, `backend/.venv/`, and Python caches should stay ignored.

## Frontend

The frontend lives in `frontend/` and uses the Next.js App Router.

Important files:

- `frontend/app/page.tsx`: home page hosting the floating four-color graph toy.
- `frontend/app/layout.tsx`: root layout and metadata/favicons.
- `frontend/components/AppShell.tsx`: wraps normal site pages with header/footer/click sound, but hides the shell for `/play/...`.
- `frontend/app/[section]/page.tsx`: section listing page, such as `/games`.
- `frontend/app/[section]/[item]/page.tsx`: item detail card with title/body/image/play button.
- `frontend/components/SiteHeader.tsx`: top navigation generated from registered sections.
- `frontend/components/AccountNavLink.tsx`: right-side account icon in the site header; switches icon based on Supabase session state and links to `/login`.
- `frontend/components/SectionCard.tsx`: retro card used on section pages.
- `frontend/lib/sections.ts`: section registry plus filesystem discovery of `content/<section>/<item>/meta.json`.
- `frontend/lib/api.ts`: API base URL helper using `NEXT_PUBLIC_API_BASE_URL`.

Frontend env:

```txt
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

For local development:

```txt
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Shared Account Flow

The normal site shell has a small account icon at the far right of the header, after Tools. It links to:

```txt
/login
```

Important files:

- `frontend/app/login/page.tsx`: Suspense wrapper for the account/login client.
- `frontend/app/login/LoginClient.tsx`: shared email/password signup, login, signed-in account view, password changes, logout, and post-login redirect handling.
- `frontend/lib/auth/redirects.ts`: sanitizes `next` paths and preserves crossword invite codes across login/signup.
- `frontend/components/AccountNavLink.tsx`: listens to Supabase session state and renders different account icons for signed-in vs signed-out users.

Use `/login?next=/target/path` when a feature needs the user to return after authentication. Crossword invite flows can also pass:

```txt
/login?next=/play/games/cryptic-crossword-archive&invite=<code>
```

The shared login page handles authentication only. Feature-specific authorization still lives in the feature:

- StageSelect: any logged-in user can use personal library features.
- Cryptic Crossword Archive: logged-in users still need crossword approval or a valid invite.
- Crossword Admin: logged-in users still need an email listed in `CROSSWORD_ADMIN_EMAILS`.
- Red7 keeps using invisible Supabase anonymous auth and does not use this visible login flow.

## Homepage Graph

The homepage renders a dependency-free interactive SVG graph toy:

- `frontend/app/FloatingFourColorGraph.tsx`: client-side spring simulation, color interaction, responsive SVG, and solved-state celebration.
- `frontend/app/homeGraph.ts`: seeded planar graph generation and pure coloring helpers.
- `frontend/app/homeGraph.test.mjs`: generation, four-chromaticity, density, connectivity, coloring, and color-cycle tests.

Each graph has 12–16 vertices and 30–35% density. Generation preserves an odd-wheel core, so the graph is planar and exactly four-chromatic. Clicking a vertex cycles through four muted colors and adds a physical impulse; clicking an edge sends a perpendicular jiggle through its spring-connected endpoints. The color order is always cyclic, but each vertex receives a seeded random cycle start so one node may go `2 -> 3 -> 4 -> 1 -> uncolored` while another goes `1 -> 2 -> 3 -> 4 -> uncolored`. Edges use enlarged invisible hit targets, become bolder on hover, and use a brass edge highlight for keyboard focus. Nodes and edges support keyboard activation, mobile layouts use larger touch targets, and `prefers-reduced-motion` suppresses ambient drift and shortens effects. A valid coloring brightens, celebrates, and then freezes until reload.

Run homepage graph checks from `frontend/`:

```bash
npm run test:home-graph
npx tsc --noEmit
```

## Sections And Cards

Sections are registered in `frontend/lib/sections.ts`:

```ts
export const sections = [
  { slug: "games", label: "Games", description: "..." },
  { slug: "projects", label: "Projects", description: "..." },
  { slug: "tools", label: "Tools", description: "..." },
];
```

Each card is a folder with `meta.json`:

```txt
frontend/content/games/starnim/meta.json
frontend/content/tools/anagram-solver/meta.json
```

Example:

```json
{
  "title": "Starnim",
  "description": "Short text for the section listing.",
  "body": "Longer detail-card text.",
  "image": "/game-images/starnim.png",
  "playHref": "/play/games/starnim",
  "requiresBackend": true
}
```

`image` is optional. If empty or omitted, no image placeholder renders. Put images under `frontend/public/`, usually `frontend/public/game-images/`, and reference them with a leading slash.

Cards can be grouped under another card by adding `group` to child metadata and
`children` to the parent metadata. Grouped children stay reachable at their
normal detail routes, but they are hidden from the top-level section listing.

The Games section uses this for `Legacy Games`, which contains Bowling
Solitaire, Aces & Faces, Criss Cross, Dicey Dice, Farkle Frenzy, Flower and the
Wind, Starnim, and Lines of Action. Their existing `/games/<slug>` detail
routes and `/play/games/...` play targets are intentionally preserved.

## Static Games

Static games copied from old folders live under:

```txt
frontend/public/play/games/<slug>/
```

Their card metadata lives under:

```txt
frontend/content/games/<slug>/meta.json
```

For a static game, `playHref` should point to its static HTML:

```json
{
  "playHref": "/play/games/my-game/index.html"
}
```

These pages are plain public assets and do not mount the Next shell. They include a quiet top-left `TOOMUCHMATHS` link back to `/`.

Current static games:

- `aces-and-faces`
- `bowling-solitaire`
- `criss-cross`
- `dicey-dice`
- `farkle`
- `flower-and-the-wind`
- `lines-of-action`

## Connections

Connections is a client-side Next.js game, not a static public asset and not a backend-backed game.

Frontend play routes:

```txt
frontend/app/play/games/connections/
frontend/app/play/games/connections/play/[gameCode]/
```

Important files:

- `frontend/app/play/games/connections/ConnectionsGame.tsx`: create/play UI and game state.
- `frontend/app/play/games/connections/connectionsEncoding.ts`: URL-safe puzzle encoder/decoder.
- `frontend/app/play/games/connections/connections.module.css`: game-local styling based on the original Flask version.
- `frontend/content/games/connections/meta.json`: Games card entry.

Connections sharing is storage-free. The generated game URL embeds the whole puzzle payload in the final path segment:

```txt
/play/games/connections/play/<encoded-code>
```

The start screen also accepts either the whole share URL or just the encoded code. Query links also work:

```txt
/play/games/connections?gamecode=<encoded-code>
```

The encoding keeps the original helper's allowed source character set:

```txt
ABCDEFGHIJKLMNOPQRSTUVWXYZ ,-'".
```

Puzzle text is normalized to that character set before encoding. Do not mark Connections with `"requiresBackend": true`; it does not call FastAPI. The backend loading modal should be reserved for games that actually need Render to wake up.

## Red7

Red7 is a native Next.js multiplayer card game backed by Supabase, not the Render/FastAPI service.

Frontend routes:

```txt
/play/games/red7
/play/games/red7/room/<room-code>
```

Important files:

- `frontend/app/play/games/red7/Red7Game.tsx`: focused create flow, invite-link join flow, realtime room UI, reconnects, host controls, and turn interactions.
- `frontend/app/play/games/red7/red7Engine.ts`: pure client-side rule evaluation used for move previews and tests.
- `frontend/app/play/games/red7/red7Engine.test.mjs`: unit coverage for hierarchy, all seven rules, ties, empty Palettes, action previews, and the optional draw rule.
- `frontend/app/play/games/red7/red7Types.ts`: shared cards, rules, room state, player state, and action payload types.
- `frontend/app/play/games/red7/red7.module.css`: game-local responsive layout, website-matching monospace typography, rule-color atmosphere, center-out color transition, and translucent glass surfaces.
- `frontend/content/games/red7/meta.json`: Games card entry.
- `frontend/lib/supabase/database.types.ts`: typed Red7 tables and RPC signatures alongside the other Supabase types.

Players use invisible Supabase anonymous auth unless they already have a session. The room link is the invitation; no visible account flow is required. Supabase Realtime publishes room, roster, and owner-only hand changes. All mutations go through security-definer RPCs, and rooms expire after 24 hours without activity.

Rooms support two to five seated players. Late joins during a round are spectators. The host can remove players; a stale host can be replaced by the earliest active seated player. Refreshes and short disconnects retain identity through the persistent Supabase auth session and existing room membership. An offline active player pauses play until they reconnect or the host removes them.

The start screen is intentionally focused on creating a room. It has no room-code or join form; invited players join from `/room/<room-code>`, where they enter a display name and take a seat. The Red7 screens use the website's monospace visual language with a more colorful card-game treatment.

The finalized round behavior is:

- Every player receives seven hand cards and starts with an empty Palette.
- The Canvas starts on Red.
- A turn is staged locally by selecting a hand card and then clicking the shared Canvas or the player's Palette. Palette-then-Canvas is supported in that order.
- `Cancel` clears the staged move. `End turn` submits it for authoritative validation; an invalid/non-winning move is rejected without publishing its staged changes.
- There is no pass action in the UI. `Give up` performs the elimination/pass RPC.
- Cards display the rule associated with their color.
- The optional draw rule triggers only when a Canvas card is played and its value is strictly greater than the player's final Palette size. It draws one card if the deck is nonempty.
- Opponent spaces across the top merge player presence, public hand count, turn status, and Palette into one panel.
- The shared Canvas sits below the opponent spaces with centered content. Its colored rule box carries the active rule, with the interaction hint beneath it.
- The local player's actionable Palette sits below the Canvas, followed by a simplified private Hand and move controls.
- Spectators are shown separately without recreating the old standalone player roster.
- The current Canvas color spreads through the page background. A successful rule change animates outward from the center.

Red7 migrations must be applied in timestamp order:

```txt
supabase/migrations/20260607000000_red7_multiplayer.sql
supabase/migrations/20260607001000_red7_fix_uuid_winner.sql
supabase/migrations/20260607002000_red7_redeal_starting_palettes.sql
supabase/migrations/20260607003000_red7_empty_starting_palettes.sql
supabase/migrations/20260607004000_red7_canvas_draw_rule.sql
supabase/migrations/20260607005000_red7_public_hand_counts.sql
```

The `02000` starting-Palette migration is historical and is intentionally superseded by `03000`, which establishes the final empty-Palette rule. The UUID fix avoids PostgreSQL aggregate calls such as `min(uuid)`, which are not available by default. The initial migration also uses a compatible random invite-code implementation rather than assuming `gen_random_bytes(integer)` is installed.

Run Red7 checks from `frontend/`:

```bash
npm run test:red7
npx tsc --noEmit
npm run build
```

The latest UI verification on June 8, 2026 passed all eight Red7 engine tests and TypeScript checking. The redesigned create screen was visually checked at desktop and mobile widths. The production build was stopped after it stalled while an existing Next.js development server was running.

## Cryptic Crossword Archive

Cryptic Crossword Archive is a gated client-side Next.js game/subapp backed by Supabase auth and progress storage.
The bundled archive currently contains 145 barred 10x8 puzzles.

For detailed status, data shape, test checklist, limitations, and future work, read:

```txt
CROSSWORD_ARCHIVE_PLAN.md
```

Frontend play route:

```txt
frontend/app/play/games/cryptic-crossword-archive/
```

Important files:

- `frontend/app/play/games/cryptic-crossword-archive/CrypticCrosswordArchiveApp.tsx`: auth/access states, archive list, responsive player UI, keyboard/focus behavior, timer, checks/reveals, autosave, inline completion reasonings, and solve celebration.
- `frontend/app/play/games/cryptic-crossword-archive/crypticCrossword.module.css`: game-local desktop/mobile styling and completion animation.
- `frontend/content/games/cryptic-crossword-archive/meta.json`: Games card entry.
- `frontend/content/crosswords/archive.json`: bundled crossword archive data.
- `crosswords/puzzles/*.json`: canonical per-puzzle source files used by the import script.
- `frontend/lib/crosswords/`: archive/types/server helpers.
- `frontend/scripts/import-crosswords.mjs`: converts the schema `1.0` puzzle directory into the normalized archive shape.
- `frontend/scripts/validate-crosswords.mjs`: validates ids, bars, bounds, clue starts, lengths, and crossings.
- `frontend/app/admin/crosswords/`: admin UI for approving users and creating invite links.

The import script accepts only directories containing schema `1.0` puzzle JSON
files. Each normalized archive/progress id comes directly from the source
`puzzle.id`. The frontend reads only the generated
`frontend/content/crosswords/archive.json` at runtime; `crosswords/puzzles/` is
needed only when regenerating that archive.

Grid keyboard navigation:

- Typing fills the active cell and advances to the next empty cell in the active clue, skipping letters already supplied by crossings.
- Selecting a clue lands on its first empty cell; a filled clue lands on its first cell.
- Clicking a clue restores grid typing focus on desktop.
- Backspace on a filled cell clears it without moving.
- Backspace on an empty cell moves to the previous cell in the active clue and clears that cell.
- Backspace at the first clue cell clears it without moving.
- Arrow keys parallel to the active clue move within that clue.
- A perpendicular arrow first switches the active clue direction without moving; subsequent arrows in that direction move through the newly active clue.
- Delete clears the active cell without moving.
- Space toggles direction.
- Tab and Shift+Tab move to the next/previous unsolved clue. Once every clue is filled, they move sequentially.

Mobile player behavior:

- The 10x8 grid shrinks to the available viewport width without horizontal scrolling.
- There is no custom on-screen keyboard. Tapping a cell or clue focuses a hidden text input so the device's native keyboard opens.
- Cell taps preserve the current page scroll position instead of jumping to the full clue list.
- A compact box beneath the grid shows the active clue and, when present, the orthogonal clue crossing the active cell.
- The compact clue rows are tappable and switch direction while keeping keyboard input active.
- The top-left `TOOMUCHMATHS` play-page link is not fixed on mobile, so it scrolls away instead of overlapping game content. This rule also applies to the other native and standalone games.

Completion behavior:

- Correctly finishing the grid triggers a short cascading cell wave and grid pulse. The effect is suppressed for `prefers-reduced-motion`.
- Revealing the grid completes it without playing the solve celebration.
- After completion, each clue shows its answer and reasoning directly beneath the clue instead of using a separate reasonings panel.
- Check/reveal controls remain disabled after completion so the saved perfect status cannot change afterward.

Latest verification on June 15, 2026:

- `npx tsc --noEmit`
- `npm run validate:crosswords` validated all 145 puzzles.
- `npx next build --webpack`
- Desktop and 320px mobile browser checks covered clue focus, native mobile input focus, empty-cell skipping, unsolved-clue Tab navigation, inline reasonings, grid width, and mobile scroll behavior.

Crossword API routes:

```txt
GET /api/games/crosswords/access
GET /api/games/crosswords/archive
GET /api/games/crosswords/archive/[crosswordId]
POST /api/games/crosswords/invites/redeem
GET /api/games/crosswords/progress
PUT /api/games/crosswords/progress/[crosswordId]
DELETE /api/games/crosswords/progress/[crosswordId]
GET /api/admin/crosswords
POST /api/admin/crosswords/approvals
POST /api/admin/crosswords/invites
```

All crossword API routes require a Supabase bearer token. Archive/progress routes also require a row in `crossword_approvals` with `approved_at` set. Users can be approved from `/admin/crosswords` by an admin email listed in `CROSSWORD_ADMIN_EMAILS`, or by redeeming an invite link. Users cannot approve themselves without a valid invite.

The crossword archive and crossword admin screens do not render their own email/password forms. They link to the shared `/login` route with a `next` target, then enforce crossword approval or admin authorization after the user returns. Invite links preserve their code through `/login?next=/play/games/cryptic-crossword-archive&invite=<code>`.

The local development bypass button appears only when running in development on `localhost`, `127.0.0.1`, or `::1`; the matching API bypass also requires a local host and the internal `x-crossword-dev-bypass` header.

Admin env:

```txt
SUPABASE_SECRET_KEY=your-service-role-key
CROSSWORD_ADMIN_EMAILS=admin@example.com,second@example.com
```

Crossword archive scripts, from `frontend/`:

```txt
npm run import:crosswords
npm run validate:crosswords
```

Supabase migration:

```txt
supabase/migrations/20260512000000_crossword_archive.sql
supabase/migrations/20260513000000_crossword_invites.sql
```

Tables:

- `crossword_approvals`: manual allowlist keyed by `auth.users.id`.
- `crossword_invites`: admin-created invite codes, optionally email-bound, single-use.
- `crossword_progress`: per-user/per-crossword grid state, elapsed time, checks, reveals, completion time, and perfect flag.

## Starnim

Starnim is different from the static games because it needs Python logic for computer moves.

Original source/reference:

```txt
starnim/
```

Frontend play route:

```txt
frontend/app/play/games/starnim/
```

Backend logic:

```txt
backend/app/games/starnim/logic.py
```

Backend route:

```txt
POST /api/games/starnim/computer-move
```

Request shape:

```json
{
  "node_states": [false, false, false, false, false, false, false],
  "difficulty": 0.75
}
```

Response shape:

```json
{
  "move": [1, 4]
}
```

The Starnim card has:

```json
{
  "playHref": "/play/games/starnim",
  "requiresBackend": true
}
```

When the user clicks Play, the frontend first wakes/checks the backend, then navigates to `/play/games/starnim`.

## Backend Wake-Up Flow

Backend-backed cards use:

- `frontend/components/BackendLaunchButton.tsx`
- `frontend/components/BackendLoadingModal.tsx`
- `frontend/components/BackendLoadingModal.module.css`
- `frontend/lib/backendHealth.ts`

If an item has `"requiresBackend": true`, Play opens a loading modal and polls:

```txt
GET /api/health
```

When the backend returns `{ "ok": true }`, the frontend navigates to the `playHref`.

The loading modal message and YouTube link are global constants in `BackendLoadingModal.tsx`, not per-item metadata.

Current modal details:

- The YouTube link opens in a new tab.
- The link should look like a normal blue hyperlink.
- On hover, the link gets the same yellow background as site buttons.
- While loading, the cursor is hidden and a custom low-frame rotating hourglass follows the pointer.
- The hourglass styling is in `BackendLoadingModal.module.css`.

## Click Sound

The Next/Tailwind shell plays `frontend/public/computer-click.mp3` on pointer clicks via:

```txt
frontend/components/ClickSound.tsx
```

It uses Web Audio for low-latency repeated clicks and a fallback audio pool. Sound plays only for primary mouse-button pointer events; touch and pen interactions stay silent. The click sound is not mounted under `/play/...`, so games/apps do not inherit it.

## Lookup

Lookup is a normal shell-styled tool for searching both dictionary words and proper nouns/entities. It should keep the site's mono typography and restrained retro influence, but its current visual direction is more modern/fresh than the beige default shell: soft warm-white page background, subtle rounded panels, light borders, muted sage/clay/blue accents, and no graph-paper beige page gaps.

Frontend route:

```txt
frontend/app/tools/lookup/
```

Card metadata:

```txt
frontend/content/tools/lookup/meta.json
```

API route:

```txt
frontend/app/api/tools/lookup/route.ts
```

Styling:

```txt
frontend/app/tools/lookup/lookup.module.css
```

The client calls `GET /api/tools/lookup?q=...`. The API route performs two live lookups in parallel:

- dictionary definitions/synonyms from `api.dictionaryapi.dev`
- entity matches from Wikidata `wbsearchentities`, plus Wikipedia search for clue-like phrases that raw Wikidata search misses

Results are returned separately as `dictionary` and `entities`; this first version does not use embeddings or LLM ranking.

Current UX notes:

- Dictionary definitions are grouped by part of speech. Parts of speech render as stronger section labels; synonyms, antonyms, aliases, and sentence labels render as lower-level metadata.
- Individual definitions are explicitly numbered within each part-of-speech group so separate meanings are visually clear.
- Dictionary examples render under `Use it in a sentence`.
- Synonym and antonym chips are clickable. Clicking a chip replaces the search input value, immediately runs a new lookup for that word, and scrolls smoothly back to the top/search area.
- Entity aliases render as chips but are not currently clickable.
- Source links use subdued text-link styling rather than button styling.

## Flashcards

Flashcards is a signed-in project app for manually creating study card sets and
reviewing one or more sets with weighted repetition. It is currently manual
entry only; PDF upload, OCR, and AI card generation are future work.

Project card:

```txt
frontend/content/projects/flashcards/meta.json
```

Frontend route and modules:

```txt
frontend/app/projects/flashcards/page.tsx
frontend/app/projects/flashcards/FlashcardsApp.tsx
frontend/app/projects/flashcards/flashcards.module.css
```

Supabase migration:

```txt
supabase/migrations/20260713000000_flashcards.sql
```

Tables:

- `flashcard_sets`: user-owned sets with title and description.
- `flashcards`: user-owned cards with `question`, `answer`, and `set_id`.

Both tables use RLS so authenticated users can only read/write their own sets
and cards. The generated client types in
`frontend/lib/supabase/database.types.ts` include both tables.

Current UX:

- Uses the shared `/login` flow via `/login?next=/projects/flashcards`.
- The app has `Sets`, `Cards`, and `Play` tabs.
- Users can create/delete sets, add/edit/delete cards, and choose one or more
  sets for play.
- Text entry auto-capitalizes the first typed letter in set titles, notes,
  questions, and answers.
- Card previews in the Cards tab are rendered as two independent masonry-like
  column stacks at desktop/tablet widths. Each card takes only the height its
  own content needs, so left/right card tops and bottoms intentionally do not
  align by row.
- Card preview labels such as `Question` and `Answer` are intentionally hidden;
  the question is the main text and the answer appears in a muted sage panel.
- The visual language follows Lookup rather than the harder beige shell style:
  soft warm-white page background, 1px borders, 8px panels/cards, quiet shadows,
  and muted sage/clay accents.

Current play behavior:

- A play session is client-side only and does not persist review history yet.
- The student sees one random card question, clicks `Show Answer`, then marks
  the card right or wrong.
- Each card has a per-session `weight` and `cooldown`.
- Correct answers lower the card weight and give it a longer cooldown.
- Wrong answers raise the card weight and give it a short cooldown.
- The just-seen card is avoided when possible so it does not immediately repeat
  unless the selected deck is too small.
- Play card question/answer text is centered.

## Anagram Solver

The Anagram Solver is a normal shell-styled tool, not an isolated `/play/...` app.

Frontend route:

```txt
frontend/app/tools/anagram-solver/
```

Card metadata:

```txt
frontend/content/tools/anagram-solver/meta.json
```

Dictionary assets live directly under:

```txt
frontend/public/anagram-dictionaries/
```

The browser fetches either `scrabble.json` or `general.json` and filters locally. These public JSON files are the maintained deploy-time dictionary assets; there is no build-time dictionary generation step.

Supported pattern syntax:

- `?` matches any single letter.
- Quoted text keeps relative order, such as `len"ist"`.
- Parentheses keep a group contiguous but anagrammed internally, such as `abc(def)gh`.
- Quoted and parenthesized pieces are placed as non-overlapping spans.
- `^` anchors everything before it to the start; `$` anchors everything after it to the end.
- Anchors do not imply any extra length. Use `?` for each unknown letter, such as `ab^????` for 6-letter words starting with an anagram of `ab`.

## StageSelect

StageSelect is a dedicated project app for rating, reviewing, and tracking video games.

Project card:

```txt
frontend/content/projects/stageselect/meta.json
```

Frontend routes and modules:

```txt
frontend/app/projects/stageselect/page.tsx
frontend/app/projects/stageselect/StageSelectApp.tsx
frontend/app/api/projects/stageselect/search/route.ts
frontend/app/api/projects/stageselect/library/route.ts
frontend/app/api/projects/stageselect/library/[userGameId]/route.ts
frontend/lib/igdb/client.ts
frontend/lib/igdb/types.ts
frontend/lib/supabase/client.ts
frontend/lib/supabase/database.types.ts
frontend/lib/supabase/server.ts
frontend/lib/stageselect/api.ts
frontend/lib/stageselect/storage.ts
```

Planning/handoff file:

```txt
STAGESELECT_PLAN.md
```

StageSelect intentionally uses a cleaner modern app style rather than the beige retro shell aesthetic, so game covers and library cards get visual priority. It supports a small two-symbol theme toggle under the subtitle: `☼` for the original light neutral look and `☾` for the newer sleek dark mode. The selected theme is stored in `localStorage` under `stageselect-theme`. Light mode should preserve the original neutral buttons, focus rings, status pills, platform pills, and rating display; dark mode uses warm charcoal surfaces with restrained brass accents.

Current behavior:

- StageSelect uses the shared `/login` account flow for signup, login, password changes, and general account management.
- The StageSelect account panel is intentionally quiet: when signed in it shows a small active state, the current email/display name, and compact Account, Export JSON, and Log out actions.
- Logged-out users can still search IGDB, but saving games, loading personal library/stats, editing/removing saved games, and JSON export require login.
- Supabase uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; prefer publishable keys over legacy anon JWT keys.
- Supabase clients are typed with `frontend/lib/supabase/database.types.ts`, derived from the current StageSelect migrations.
- Signup from the shared login page sends `emailRedirectTo` to the sanitized `next` path on the current origin, so StageSelect confirmation links return to `/projects/stageselect`.
- IGDB search runs through the Next route `GET /api/projects/stageselect/search?q=...`; IGDB client id/secret stay server-side.
- IGDB access tokens are requested with Twitch client credentials and cached in memory until shortly before expiry.
- Search results are normalized and locally ranked by relevance/popularity signals so obvious major games rise higher.
- Search and Library are separate tabs.
- Users can save games with statuses: `finished`, `left`, `playing`, `backlogged`, `wishlisted`.
- `finished`, `left`, `playing`, and `backlogged` open a modal with mandatory platform plus optional star rating and review.
- `wishlisted` saves immediately without review/rating.
- Save, update, and remove writes run through Next API routes under `/api/projects/stageselect/library`.
- The save route caches cover images in Supabase Object Storage when `SUPABASE_SECRET_KEY` and the bucket are configured, then stores `cover_storage_path` plus the cached public `cover_url`.
- If cover upload is unavailable, the save route preserves any existing cached cover before falling back to the IGDB URL.
- Library reads from Supabase and shows compact cover cards with non-cropping portrait artwork plus colored status/platform chips.
- Library rendering is paginated client-side in chunks so large libraries do not render every visible card at once.
- Clicking a library card opens an edit modal where the user can update status/platform/rating/review or remove the game; platform edits use a dropdown from cached IGDB platform data.
- Library ratings render as outlined 5-star displays with clearer half-star treatment and an explicit numeric score; unrated games show a dash.
- Library filters currently include platform, status, release year, rating bucket, and review presence; sorts include title, rating high/low, newest/oldest, status, and platform.
- Stats include core totals, finished/queue/five-star counts, finish rate, favorite platform, top-rated games, and bar charts for status, platform, and each individual half-star rating.
- StageSelect uses Supabase Object Storage, not Cloudflare/R2, for cached game images/covers.

Supabase migrations live under:

```txt
supabase/migrations/
```

Current migrations:

- `20260511000000_stageselect_schema.sql`: profiles, cached games, user library, reviews, enums, RLS, profile trigger.
- `20260511001000_stageselect_game_cache_policies.sql`: authenticated users can cache/refresh selected IGDB game metadata.
- `20260511002000_stageselect_user_game_platform.sql`: user-selected platform on `stageselect_user_games`.
- `20260511003000_stageselect_storage_bucket.sql`: public Supabase Storage bucket for cached cover images.
- `20260511004000_stageselect_cover_storage_path.sql`: forward migration for existing databases that predate `cover_storage_path`.

Frontend env:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
STAGESELECT_STORAGE_BUCKET=stageselect-game-images
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
```

`frontend/.env.local` is ignored and may contain local Supabase/IGDB credentials. Do not commit secrets. `SUPABASE_SECRET_KEY` is server-only and must not use a `NEXT_PUBLIC_` prefix. The IGDB client secret pasted during development should be rotated before production.

## Backend

FastAPI backend lives in `backend/`.

Important files:

- `backend/app/main.py`: FastAPI app, CORS middleware, router registration.
- `backend/app/core/config.py`: reads `FRONTEND_ORIGINS`.
- `backend/app/api/health.py`: shared health endpoint.
- `backend/app/api/games/starnim.py`: Starnim API route.
- `backend/app/games/starnim/logic.py`: Python game logic.
- `backend/requirements.txt`: backend dependencies.
- `backend/.env.example`: backend env example.

Backend env:

```txt
FRONTEND_ORIGINS=https://your-vercel-site.vercel.app
```

For local development:

```txt
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

For multiple origins, use comma separation.

## Local Commands

Frontend:

```bash
cd frontend
npm run dev
npm run build
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend health check:

```bash
curl http://localhost:8000/api/health
```

Starnim backend smoke test:

```bash
curl -X POST http://localhost:8000/api/games/starnim/computer-move \
  -H "Content-Type: application/json" \
  -d '{"node_states":[false,false,false,false,false,false,false],"difficulty":0.75}'
```

Known local build note: Next/Turbopack may need normal local permissions because it spawns helper processes. In Codex this has sometimes required an escalated `npm run build`.

## Deployment

### Frontend on Vercel

Use the same Git repo and set:

```txt
Root Directory: frontend
Framework: Next.js
Build Command: npm run build
Output: .next
```

Set env:

```txt
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

Redeploy Vercel whenever this env var changes, because `NEXT_PUBLIC_*` is bundled at build time.

### Backend on Render

Use a manual Render Web Service, not a Blueprint.

Settings:

```txt
Root Directory: backend
Runtime: Python
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Set env:

```txt
FRONTEND_ORIGINS=https://your-vercel-site.vercel.app
```

If testing local frontend against deployed backend, include local origins too.

## Adding Future Backend-Backed Games Or Projects

1. Add backend logic under `backend/app/games/<slug>/` or another appropriate backend module.
2. Add route file under `backend/app/api/games/<slug>.py` or `backend/app/api/projects/<slug>.py`.
3. Register the router in `backend/app/main.py`.
4. Add a frontend route under `frontend/app/play/games/<slug>/` or another `/play/...` route.
5. Add `frontend/content/<section>/<slug>/meta.json` with:

```json
{
  "playHref": "/play/games/slug",
  "requiresBackend": true
}
```

Use the shared `BackendLaunchButton` and health endpoint unless the feature needs a special warm-up check.

## Current Working Tree Notes

Do not commit unless the user explicitly asks.
