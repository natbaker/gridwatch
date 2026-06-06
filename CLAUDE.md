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

## Self-Hosted OpenF1 Stack (Kubernetes)

All live timing data flows through a self-hosted OpenF1 instance in the `gridwatch` K8s namespace (on `scruffy`, managed by `~/git/tf/openf1.tf`):

- **MongoDB** (`openf1-mongodb`): database is `openf1-livetiming` (not `openf1`)
- **MQTT** (`openf1-mqtt`): message broker between ingestor and API
- **openf1-api**: serves `http://openf1-api:8000/v1` in-cluster; gridwatch backend hits this first, falls back to `https://api.openf1.org/v1`
- **openf1-ingest-realtime**: connects to F1's SignalR live timing feed; scaled to 0 between sessions by `openf1-scale-ingest` CronJob

**F1TV token** (`openf1-f1tv` K8s secret): required for premium data (car telemetry `CarData.z`, GPS positions `Position.z`). Without a valid token, you only get public timing data (laps, race control). Token expires every ~4 days and is auto-refreshed daily at 06:00 UTC by `openf1-refresh-token` CronJob.

**Useful commands:**
```bash
# Force token refresh now
kubectl create job -n gridwatch --from=cronjob/openf1-refresh-token token-manual-1
kubectl logs -n gridwatch -l job-name=token-manual-1 -f

# Force scaler run now
kubectl create job -n gridwatch --from=cronjob/openf1-scale-ingest scale-manual-1
kubectl logs -n gridwatch -l job-name=scale-manual-1 -f

# Check MongoDB
kubectl exec -n gridwatch deployment/openf1-mongodb -- mongosh openf1-livetiming --quiet --eval "db.getCollectionNames()"
```

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
