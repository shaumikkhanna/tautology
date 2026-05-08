# Project Overview for Future Codex Chats

This workspace is a Next.js migration shell for the old Tautology Flask/static-games site.

## Current Shape

- `frontend/` is the active app.
- `frontend/app/` uses the Next.js App Router.
- `frontend/app/page.tsx` is the intentionally minimal home page with only `P ∨ ¬ P`.
- `frontend/app/[section]/page.tsx` renders a section page, such as `/games` or `/projects`.
- `frontend/app/[section]/[item]/page.tsx` renders a simple detail card for an item, with title, text, optional image, and a Play button when `playHref` exists.
- `frontend/components/` contains shared UI pieces: header, footer, and section cards.
- `frontend/lib/sections.ts` is the small registry/discovery layer for sections and content folders.
- `frontend/content/<section>/<item>/meta.json` is the content source for section listings and detail cards.
- `frontend/public/play/games/<slug>/` contains isolated static HTML/CSS/JS game bundles copied from the old games.
- `frontend/public/favicons/` contains favicon assets used by Next metadata in `frontend/app/layout.tsx`.

## Design Direction

The site should feel like a clean, modern version of old basic HTML/JS pages:

- Beige paper background, dark ink panels, mono-ish labels.
- Keep the home page quiet and nearly empty.
- Section pages can use the retro cards.
- Individual games should keep their own original styling and not inherit the Tautology beige shell.
- Static games include a very quiet top-left `P or not P` link back to `/`; it uses current text color and low opacity so it does not fight each game's palette.
- The Next/Tailwind shell plays `/computer-click.mp3` on pointer clicks via `frontend/components/ClickSound.tsx`. Isolated static game pages under `frontend/public/play/...` do not include this component, so the click sound stops after users press Play.

## Adding a Section

1. Add an entry to `sections` in `frontend/lib/sections.ts`.
2. Create `frontend/content/<section-slug>/`.
3. The header and route are generated from the section registry.

Example:

```ts
{
  slug: "writing",
  label: "Writing",
  description: "Essays, notes, and other text things."
}
```

## Adding a Game or Project Card

Create a folder:

```txt
frontend/content/games/my-game/meta.json
```

Example:

```json
{
  "title": "My Game",
  "description": "Short text shown on the section list card.",
  "body": "Longer text shown on the detail card.",
  "image": "/game-images/my-game.png",
  "playHref": "/play/games/my-game/index.html"
}
```

`image` is optional. If absent or blank, no image box renders. Put images somewhere under `frontend/public/`, usually `frontend/public/game-images/`, and reference them with a leading slash.

## Adding an Isolated Static Game

Put the full game bundle here:

```txt
frontend/public/play/games/my-game/
```

Keep the game's own `index.html`, CSS, JS, images, and sounds together in that folder. The Play button should point to:

```txt
/play/games/my-game/index.html
```

This keeps the game styles isolated from the Next/Tailwind shell.

## Useful Commands

Run from `frontend/`:

```bash
npm run dev
npm run build
```

The build may need normal local permissions because Turbopack spawns helper processes.

## Git Notes

The repository is rooted at the workspace root, not inside `frontend/`. Generated folders such as `frontend/node_modules/` and `frontend/.next/` are ignored.
