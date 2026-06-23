import logging

from app.cache import TTLCache, cached_async
from app.config import settings
from app.constants import TEAM_COLORS
from app.services.clients.jolpica import JolpicaClient

logger = logging.getLogger(__name__)

CURRENT_SEASON = 2026


def _empty_standings(season: int = CURRENT_SEASON) -> dict:
    return {"season": season, "round": 0, "standings": [], "warnings": ["Standings unavailable"]}


class StandingsFacade:
    def __init__(self, jolpica: JolpicaClient, cache: TTLCache) -> None:
        self._jolpica = jolpica
        self._cache = cache

    @cached_async(
        ttl=settings.cache_ttl_standings,
        key=lambda season=CURRENT_SEASON: f"standings_drivers_{season}",
        stale_warning="Using cached standings data",
        default=_empty_standings,
    )
    async def get_driver_standings(self, season: int = CURRENT_SEASON) -> dict:
        data = await self._jolpica.get_driver_standings(season)
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
        return {
            "season": season,
            "round": int(data["round"]),
            "standings": standings,
            "warnings": [],
        }

    @cached_async(
        ttl=settings.cache_ttl_standings,
        key=lambda season=CURRENT_SEASON: f"standings_constructors_{season}",
        stale_warning="Using cached standings data",
        default=_empty_standings,
    )
    async def get_constructor_standings(self, season: int = CURRENT_SEASON) -> dict:
        data = await self._jolpica.get_constructor_standings(season)
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
        return {
            "season": season,
            "round": int(data["round"]),
            "standings": standings,
            "warnings": [],
        }
