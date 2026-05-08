# Tautology Backend

FastAPI service for Python-backed games, ML endpoints, and future non-static project features.

## Local Dev

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET /api/health` returns `{ "ok": true }` and is used by the frontend while Render wakes up.
- `POST /api/games/starnim/computer-move` returns the computer move for Starnim.

## Environment

```txt
FRONTEND_ORIGINS=http://localhost:3000,https://your-vercel-domain.vercel.app
```
