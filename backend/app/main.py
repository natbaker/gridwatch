from contextlib import asynccontextmanager
import asyncio
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app import metrics
from app.cache import TTLCache
from app.config import settings
from app.logging_config import configure_logging
from app.observability import init_sentry
from app.routers import health, results, schedule, standings, weather, news, live_timing, analytics, admin
from app.services.circuit_breaker import CircuitBreaker
from app.services.clients.jolpica import JolpicaClient
from app.services.clients.openf1 import OpenF1Client
from app.services.clients.openmeteo import OpenMeteoClient
from app.services.clients.rss import RSSClient
from app.services.facades.results import ResultsFacade
from app.services.facades.schedule import ScheduleFacade
from app.services.facades.standings import StandingsFacade
from app.services.facades.weather import WeatherFacade
from app.services.facades.news import NewsFacade
from app.services.facades.live_timing import LiveTimingFacade
from app.services.facades.analytics import AnalyticsFacade


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level, settings.json_logs)
    init_sentry(settings.sentry_dsn, release=settings.app_version)

    app.state.http_client = httpx.AsyncClient(timeout=10.0)
    app.state.cache = TTLCache()

    jolpica_client = JolpicaClient(
        httpx.AsyncClient(base_url=settings.jolpica_base_url, timeout=10.0, follow_redirects=True),
        asyncio.Semaphore(4),
        breaker=CircuitBreaker(
            name="jolpica",
            failure_threshold=settings.circuit_breaker_threshold,
            cooldown_seconds=settings.circuit_breaker_cooldown,
        ),
    )

    fallback_client = (
        httpx.AsyncClient(base_url=settings.openf1_fallback_url, timeout=30.0)
        if settings.openf1_fallback_url
        else None
    )
    openf1_client = OpenF1Client(
        httpx.AsyncClient(base_url=settings.openf1_base_url, timeout=30.0),
        fallback_client=fallback_client,
        breaker=CircuitBreaker(
            name="openf1-primary",
            failure_threshold=settings.circuit_breaker_threshold,
            cooldown_seconds=settings.circuit_breaker_cooldown,
        ),
    )

    openmeteo_client = OpenMeteoClient(
        httpx.AsyncClient(base_url=settings.openmeteo_base_url, timeout=10.0),
    )
    rss_client = RSSClient(app.state.http_client)

    app.state.jolpica = jolpica_client
    app.state.openf1 = openf1_client
    app.state.openmeteo = openmeteo_client
    app.state.schedule_facade = ScheduleFacade(jolpica_client, openf1_client, app.state.cache)
    app.state.standings_facade = StandingsFacade(jolpica_client, app.state.cache)
    app.state.results_facade = ResultsFacade(jolpica_client, app.state.cache)
    app.state.weather_facade = WeatherFacade(openmeteo_client, app.state.cache)
    app.state.news_facade = NewsFacade(rss_client, app.state.cache)
    app.state.live_timing_facade = LiveTimingFacade(openf1_client, app.state.cache, app.state.http_client)
    app.state.analytics_facade = AnalyticsFacade(jolpica_client, app.state.cache)

    yield

    await app.state.http_client.aclose()
    await app.state.jolpica._http.aclose()
    await app.state.openf1._http.aclose()
    if fallback_client:
        await fallback_client.aclose()
    await app.state.openmeteo._http.aclose()


app = FastAPI(title="Grid Watch API", version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _metrics_middleware(request: Request, call_next):
    if not settings.metrics_enabled:
        return await call_next(request)
    start = time.perf_counter()
    response = await call_next(request)
    # Use the matched route template (not the raw path) to keep label cardinality bounded.
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    metrics.observe_request(request.method, path, response.status_code, time.perf_counter() - start)
    return response


@app.get("/metrics")
async def metrics_endpoint() -> Response:
    if not (settings.metrics_enabled and metrics.available()):
        return Response("metrics unavailable", status_code=503, media_type="text/plain")
    body, content_type = metrics.render()
    return Response(body, media_type=content_type)


app.include_router(health.router)
app.include_router(schedule.router)
app.include_router(standings.router)
app.include_router(results.router)
app.include_router(weather.router)
app.include_router(news.router)
app.include_router(live_timing.router)
app.include_router(analytics.router)
app.include_router(admin.router)

import logging as _logging
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

logger = _logging.getLogger(__name__)

static_dir = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        if path.startswith("api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        file_path = static_dir / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
