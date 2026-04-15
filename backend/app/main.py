from contextlib import asynccontextmanager
import asyncio

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache import TTLCache
from app.config import settings
from app.response_cache import ResponseCache
from app.routers import health, results, schedule, standings, weather, news, live_timing, analytics, admin
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
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.http_client = httpx.AsyncClient(timeout=10.0)
    app.state.cache = TTLCache()

    jolpica_client = JolpicaClient(
        httpx.AsyncClient(base_url=settings.jolpica_base_url, timeout=10.0, follow_redirects=True),
        asyncio.Semaphore(4),
    )
    openf1_cache = ResponseCache()
    openf1_client = OpenF1Client(
        httpx.AsyncClient(base_url=settings.openf1_base_url, timeout=30.0),
        cache=openf1_cache,
    )

    openmeteo_client = OpenMeteoClient(
        httpx.AsyncClient(base_url=settings.openmeteo_base_url, timeout=10.0),
    )
    rss_client = RSSClient(app.state.http_client)

    app.state.jolpica = jolpica_client
    app.state.openf1 = openf1_client
    app.state.openf1_cache = openf1_cache
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
    await app.state.openmeteo._http.aclose()


app = FastAPI(title="Grid Watch API", version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

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
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

logger = _logging.getLogger(__name__)

# Serve frontend static files in production
static_dir = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    # SPA catch-all: serve index.html for non-API, non-file paths
    # Note: this must use {path:path} but we need to also register explicit
    # sub-path patterns so FastAPI doesn't let this override API sub-routes
    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        if path.startswith("api/"):
            # Should not reach here for valid API routes (routers take priority)
            # but just in case, return proper 404
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        file_path = static_dir / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
