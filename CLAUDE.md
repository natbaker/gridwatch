# Gridwatch

F1 dashboard with live timing, session replay, standings, analytics, and weather. React + FastAPI, deployed as a single Docker container.

## Running

```bash
# Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

# Tests
cd backend && uv run --extra dev python -m pytest

# Docker
docker compose up
```

## Project Structure

**Backend** (`backend/app/`) — clients → facades → routers

- `services/clients/` — thin wrappers: Jolpica/Ergast, OpenF1, Open-Meteo, RSS
- `services/facades/` — business logic, one per domain
- `routers/` — FastAPI route handlers
- `config.py` — all config via `GRIDWATCH_*` env vars

**Frontend** (`frontend/src/`)

- `pages/` — Dashboard, Calendar, Session (live/replay/results), Analytics, Admin
- `hooks/` — one per data domain (`useSchedule`, `useLiveTiming`, `useReplay`, etc.)
- `types/index.ts` — all shared TypeScript types

Stack: React + Vite + TanStack Query + React Router + Tailwind

## Key Technical Details

**Caching**
- OpenF1 API responses cached in SQLite at `/data/openf1_cache.db` — permanent for historical sessions, 5-min TTL for live data
- Telemetry, positions, and radio are downloaded on demand via the Admin page and stored in `/data/f1.db`
- In-memory TTLCache for Jolpica/schedule/standings responses

**Data**
- 2026 fallback schedule is hardcoded in `schedule.py` for when Jolpica data is unavailable
- Production: frontend served as static files from `frontend/dist/` via FastAPI's SPA fallback
- Jolpica renumbers rounds skipping cancelled races; OpenF1 includes cancelled meetings in its list. Never map Jolpica round → OpenF1 meeting by array index — match by date instead

## Code Conventions

- No comments unless the *why* is non-obvious
- No unnecessary abstractions — keep code direct
- Backend: async throughout; use `asyncio.gather` for parallel API calls
- Frontend: TypeScript strict mode; all types go in `types/index.ts`; Tailwind for styling

## Testing

- Tests live in `backend/tests/`
- Mock external clients (Jolpica, OpenF1) — never hit live APIs in tests
- Use `pytest-asyncio` for async tests
