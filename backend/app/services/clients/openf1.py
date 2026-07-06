import asyncio
import logging

import httpx

from app.services.circuit_breaker import CircuitBreaker, CircuitOpenError

logger = logging.getLogger(__name__)


class OpenF1Client:
    def __init__(
        self,
        http_client: httpx.AsyncClient,
        fallback_client: httpx.AsyncClient | None = None,
        breaker: CircuitBreaker | None = None,
    ) -> None:
        self._http = http_client
        self._fallback = fallback_client
        self._breaker = breaker

    async def _get(self, path: str, params: dict | None = None) -> list[dict]:
        try:
            result = await self._call_primary(path, params)
        except CircuitOpenError:
            logger.debug("OpenF1 primary circuit open for %s, using fallback", path)
            result = []
        if not result and self._fallback:
            logger.debug("Local OpenF1 empty for %s, trying fallback", path)
            result = await self._fetch(self._fallback, path, params, is_fallback=True)
        return result

    async def _call_primary(self, path: str, params: dict | None) -> list[dict]:
        if self._breaker:
            return await self._breaker.call(
                lambda: self._fetch(self._http, path, params, is_fallback=False)
            )
        return await self._fetch(self._http, path, params, is_fallback=False)

    async def _fetch(self, client: httpx.AsyncClient, path: str, params: dict | None, is_fallback: bool = False) -> list[dict]:
        attempts = 1 if is_fallback else 4
        for attempt in range(attempts):
            resp = await client.get(path, params=params)
            if resp.status_code == 404:
                return []
            if resp.status_code == 429:
                if is_fallback:
                    logger.debug("Fallback rate limited on %s", path)
                    return []
                wait = (attempt + 1) * 5
                logger.warning("Rate limited on %s, retrying in %ds...", path, wait)
                await asyncio.sleep(wait)
                continue
            if resp.status_code == 401:
                logger.warning("Unauthorized on %s (API locked during live session)", path)
                return []
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):
                return []
            return data

        logger.warning("Failed after retries: %s", path)
        return []

    async def get_meetings(self, year: int) -> list[dict]:
        return await self._get("/meetings", params={"year": str(year)})

    async def get_meetings_by_key(self, meeting_key: int) -> list[dict]:
        return await self._get("/meetings", params={"meeting_key": str(meeting_key)})

    async def get_positions(self, session_key: int) -> list[dict]:
        return await self._get("/position", params={"session_key": str(session_key)})

    async def get_intervals(self, session_key: int) -> list[dict]:
        return await self._get("/intervals", params={"session_key": str(session_key)})

    async def get_session_result(self, session_key: int) -> list[dict]:
        return await self._get("/session_result", params={"session_key": str(session_key)})

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
        result = await self._get("/drivers", params={"session_key": str(session_key)})
        # ingest-realtime may capture incomplete rosters; F1 sessions always have 16-20 drivers.
        # If primary returned suspiciously few, supplement from fallback.
        if len(result) < 10 and self._fallback:
            fallback = await self._fetch(self._fallback, "/drivers",
                                         {"session_key": str(session_key)}, is_fallback=True)
            if fallback:
                primary_nums = {d.get("driver_number") for d in result}
                for d in fallback:
                    if d.get("driver_number") not in primary_nums:
                        result.append(d)
        return result

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

    async def check_has_locations(self, session_key: int) -> bool:
        """Lightweight existence check — passes limit=1 to avoid fetching bulk data."""
        result = await self._get("/location", params={"session_key": str(session_key), "limit": "1"})
        return len(result) > 0

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
