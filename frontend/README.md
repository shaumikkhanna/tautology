# Tautology Frontend

Next.js + Tailwind migration shell for the Flask app.

## Structure

- `app/` contains the shared layout, home page, section pages, and item pages.
- `lib/sections.ts` is the section registry and filesystem discovery layer.
- `content/<section>/<item>/` contains items that appear automatically on a section page.

## Add a Section

Add an entry to `sections` in `lib/sections.ts`, then create a matching folder:

```txt
content/new-section/
```

The header and route `/new-section` will use that registry entry.

## Add an Item

Create a folder inside a section:

```txt
content/games/my-game/meta.json
```

The folder appears automatically on `/games`. The item page renders a simple card from `meta.json`; `playHref` points at the isolated game.

```json
{
  "title": "My Game",
  "description": "Short description.",
  "body": "Longer placeholder text for the card.",
  "image": "/game-images/my-game.png",
  "playHref": "/play/games/my-game/index.html",
  "requiresBackend": false
}
```

`image` is optional. If it is blank or omitted, the card does not reserve image space. Put images in `public/game-images/` or another folder under `public/`, then reference them with a leading slash, such as `/game-images/my-game.png`.

For a custom Next route in the list, add `href` to `meta.json`:

```json
{
  "title": "My Game",
  "description": "Short description.",
  "href": "/games/my-game-next"
}
```

Set `requiresBackend` to `true` when the Play button should first wait for the shared backend health endpoint before opening the app. The frontend reads the API base URL from:

```txt
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```
