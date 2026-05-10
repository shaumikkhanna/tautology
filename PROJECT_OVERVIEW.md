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

- `frontend/app/page.tsx`: minimal home page with only `P ∨ ¬ P`.
- `frontend/app/layout.tsx`: root layout and metadata/favicons.
- `frontend/components/AppShell.tsx`: wraps normal site pages with header/footer/click sound, but hides the shell for `/play/...`.
- `frontend/app/[section]/page.tsx`: section listing page, such as `/games`.
- `frontend/app/[section]/[item]/page.tsx`: item detail card with title/body/image/play button.
- `frontend/components/SiteHeader.tsx`: top navigation generated from registered sections.
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

These pages are plain public assets and do not mount the Next shell. They include a quiet top-left `P or not P` link back to `/`.

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

It uses Web Audio for low-latency repeated clicks and a fallback audio pool. The click sound is not mounted under `/play/...`, so games/apps do not inherit it.

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

As of this update, there are uncommitted changes related to the backend/Starnim migration and loading modal. The user has asked not to commit unless explicitly requested.

`render.yaml` appears deleted in Git status. This matches the later decision to use a manual Render Web Service rather than Render Blueprints. Do not recreate it unless the user asks.
