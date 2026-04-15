import logging

from app.cache import TTLCache
from app.config import settings
from app.services.clients.jolpica import JolpicaClient

logger = logging.getLogger(__name__)

CURRENT_SEASON = 2026

TEAM_COLORS = {
    "Mercedes": "#27F4D2",
    "Ferrari": "#E80020",
    "Red Bull": "#3671C6",
    "McLaren": "#FF8000",
    "Aston Martin": "#229971",
    "Alpine": "#FF87BC",
    "Haas": "#B6BABD",
    "RB": "#6692FF",
    "Racing Bulls": "#6692FF",
    "Williams": "#64C4FF",
    "Kick Sauber": "#FF0000",
    "Audi": "#FF0000",
    "Cadillac": "#1E1E1E",
}


class StandingsFacade:
    def __init__(self, jolpica: JolpicaClient, cache: TTLCache) -> None:
        self._jolpica = jolpica
        self._cache = cache

    async def get_driver_standings(self, season: int = CURRENT_SEASON) -> dict:
        cache_key = f"standings_drivers_{season}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []
        try:
            data = await self._jolpica.get_driver_standings(season)
        except Exception as e:
            logger.warning(f"Driver standings failed: {e}")
            stale = self._cache.get_stale(cache_key)
            if stale:
                stale["warnings"] = ["Using cached standings data"]
                return stale
            return {"season": season, "round": 0, "standings": [], "warnings": ["Standings unavailable"]}

        standings = []
        for d in data["drivers"]:
            team = d["constructor"]
            standings.append({
                "position": int(d["position"]),
                "driver": f"{d['given_name']} {d['family_name']}",
                "abbreviation": d["code"],
                "team": team,
                "team_color": TEAM_COLORS.get(team, "#888888"),
                "points": float(d["points"]),
                "wins": int(d["wins"]),
            })

        result = {
            "season": season,
            "round": int(data["round"]),
            "standings": standings,
            "warnings": warnings,
        }
        self._cache.set(cache_key, result, settings.cache_ttl_standings)
        return result

    async def get_constructor_standings(self, season: int = CURRENT_SEASON) -> dict:
        cache_key = f"standings_constructors_{season}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []
        try:
            data = await self._jolpica.get_constructor_standings(season)
        except Exception as e:
            logger.warning(f"Constructor standings failed: {e}")
            stale = self._cache.get_stale(cache_key)
            if stale:
                stale["warnings"] = ["Using cached standings data"]
                return stale
            return {"season": season, "round": 0, "standings": [], "warnings": ["Standings unavailable"]}

        standings = []
        for c in data["constructors"]:
            name = c["name"]
            standings.append({
                "position": int(c["position"]),
                "constructor": name,
                "team_color": TEAM_COLORS.get(name, "#888888"),
                "points": float(c["points"]),
                "wins": int(c["wins"]),
            })

        result = {
            "season": season,
            "round": int(data["round"]),
            "standings": standings,
            "warnings": warnings,
        }
        self._cache.set(cache_key, result, settings.cache_ttl_standings)
        return result
