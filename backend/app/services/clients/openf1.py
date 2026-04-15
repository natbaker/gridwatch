import asyncio
import logging
from urllib.parse import urlencode

import httpx

from app.response_cache import ResponseCache, PERMANENT_TTL, DEFAULT_TTL

logger = logging.getLogger(__name__)


class OpenF1Client:
    def __init__(self, http_client: httpx.AsyncClient, cache: ResponseCache | None = None) -> None:
        self._http = http_client
        self._cache = cache

    def _cache_key(self, path: str, params: dict | None) -> str:
        qs = urlencode(sorted((params or {}).items()))
        return f"{path}?{qs}" if qs else path

    def _ttl_for_request(self, params: dict | None) -> float:
        """Determine cache TTL based on request parameters.

        Requests scoped to a specific session_key are historical data
        that never changes — cache permanently. Meeting lists and
        session lookups by meeting_key are cached for 1 hour.
        Everything else gets a short TTL.
        """
        if not params:
            return DEFAULT_TTL
        if "session_key" in params:
            return PERMANENT_TTL
        if "meeting_key" in params or "year" in params:
            return 3600  # 1 hour
        return DEFAULT_TTL

    async def _get(self, path: str, params: dict | None = None) -> list[dict]:
        # Check cache first
        if self._cache:
            key = self._cache_key(path, params)
            cached = self._cache.get(key)
            if cached is not None:
                return cached

        for attempt in range(4):
            resp = await self._http.get(path, params=params)
            if resp.status_code == 404:
                return []
            if resp.status_code == 429:
                wait = (attempt + 1) * 5
                logger.warning(f"Rate limited on {path}, retrying in {wait}s...")
                await asyncio.sleep(wait)
                continue
            if resp.status_code == 401:
                logger.warning(f"Unauthorized on {path} (API locked during live session)")
                return []
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):
                return []

            # Cache the response
            if self._cache and data:
                key = self._cache_key(path, params)
                ttl = self._ttl_for_request(params)
                self._cache.set(key, data, ttl)

            return data

        logger.warning(f"Failed after retries: {path}")
        return []

    async def get_latest_sessions(self) -> list[dict]:
        return await self._get("/sessions", params={"meeting_key": "latest"})

    async def get_meetings(self, year: int) -> list[dict]:
        return await self._get("/meetings", params={"year": str(year)})

    async def get_meetings_by_key(self, meeting_key: int) -> list[dict]:
        return await self._get("/meetings", params={"meeting_key": str(meeting_key)})

    async def get_session_results(self, session_key: int) -> list[dict]:
        return await self._get("/drivers", params={"session_key": str(session_key)})

    async def get_positions(self, session_key: int) -> list[dict]:
        return await self._get("/position", params={"session_key": str(session_key)})

    async def get_intervals(self, session_key: int) -> list[dict]:
        return await self._get("/intervals", params={"session_key": str(session_key)})

    async def get_laps(self, session_key: int, driver_number: int | None = None) -> list[dict]:
        params: dict = {"session_key": str(session_key)}
        if driver_number is not None:
            params["driver_number"] = str(driver_number)
        return await self._get("/laps", params=params)

    async def get_stints(self, session_key: int) -> list[dict]:
        return await self._get("/stints", params={"session_key": str(session_key)})

    async def get_pit_stops(self, session_key: int) -> list[dict]:
        return await self._get("/pit", params={"session_key": str(session_key)})

    async def get_drivers(self, session_key: int) -> list[dict]:
        return await self._get("/drivers", params={"session_key": str(session_key)})

    async def get_race_control(self, session_key: int) -> list[dict]:
        return await self._get("/race_control", params={"session_key": str(session_key)})

    async def get_weather(self, session_key: int) -> list[dict]:
        return await self._get("/weather", params={"session_key": str(session_key)})

    async def get_team_radio(self, session_key: int) -> list[dict]:
        return await self._get("/team_radio", params={"session_key": str(session_key)})

    async def get_car_data(self, session_key: int, driver_number: int,
                           date_gte: str | None = None, date_lte: str | None = None) -> list[dict]:
        params: dict = {"session_key": str(session_key), "driver_number": str(driver_number)}
        if date_gte is not None:
            params["date>"] = date_gte
        if date_lte is not None:
            params["date<"] = date_lte
        return await self._get("/car_data", params=params)

    async def get_sessions(self, **params: str) -> list[dict]:
        return await self._get("/sessions", params=params)

    async def get_locations(self, session_key: int, driver_number: int | None = None,
                            date_gte: str | None = None, date_lte: str | None = None) -> list[dict]:
        params: dict = {"session_key": str(session_key)}
        if driver_number is not None:
            params["driver_number"] = str(driver_number)
        if date_gte is not None:
            params["date>"] = date_gte
        if date_lte is not None:
            params["date<"] = date_lte
        return await self._get("/location", params=params)
