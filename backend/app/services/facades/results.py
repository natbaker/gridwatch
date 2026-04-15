import logging

from app.cache import TTLCache
from app.config import settings
from app.services.clients.jolpica import JolpicaClient
from app.services.facades.standings import TEAM_COLORS

logger = logging.getLogger(__name__)

CURRENT_SEASON = 2026


class ResultsFacade:
    def __init__(self, jolpica: JolpicaClient, cache: TTLCache) -> None:
        self._jolpica = jolpica
        self._cache = cache

    async def get_latest_results(self, season: int = CURRENT_SEASON) -> dict:
        cache_key = f"results_latest_{season}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []
        try:
            data = await self._jolpica.get_latest_results(season)
        except Exception as e:
            logger.warning(f"Latest results failed: {e}")
            stale = self._cache.get_stale(cache_key)
            if stale:
                stale["warnings"] = ["Using cached results"]
                return stale
            return {
                "session_name": "Race", "short_name": "RACE",
                "race_name": "", "results": [],
                "warnings": ["Results unavailable"],
            }

        results = []
        for r in data["results"]:
            team = r["constructor"]
            results.append({
                "position": int(r["position"]),
                "driver": f"{r['given_name']} {r['family_name']}",
                "abbreviation": r["code"],
                "team": team,
                "team_color": TEAM_COLORS.get(team, "#888888"),
                "time": r.get("time"),
                "gap": None if int(r["position"]) == 1 else r.get("time"),
                "eliminated_in": None,
            })

        result = {
            "session_key": None,
            "session_name": "Race",
            "short_name": "RACE",
            "race_name": data["race_name"],
            "round": int(data.get("round", 0)),
            "results": results,
            "qualifying_segments": None,
            "warnings": warnings,
        }
        self._cache.set(cache_key, result, settings.cache_ttl_results)
        return result

    async def get_race_results(self, round_num: int, season: int = CURRENT_SEASON) -> dict:
        cache_key = f"results_round_{season}_{round_num}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []
        try:
            data = await self._jolpica.get_round_results(season, round_num)
        except Exception as e:
            logger.warning(f"Round {round_num} results failed: {e}")
            stale = self._cache.get_stale(cache_key)
            if stale:
                stale["warnings"] = ["Using cached results"]
                return stale
            return {"race_name": "", "round": round_num, "circuit": "", "date": "", "results": [], "qualifying": [], "warnings": ["Results unavailable"]}

        results = []
        for r in data["results"]:
            team = r["constructor"]
            pos = int(r["position"])
            winner_time = data["results"][0].get("time") if data["results"] else None
            results.append({
                "position": pos,
                "driver": f"{r['given_name']} {r['family_name']}",
                "abbreviation": r["code"],
                "team": team,
                "team_color": TEAM_COLORS.get(team, "#888888"),
                "time": r.get("time"),
                "gap": None if pos == 1 else r.get("time"),
                "status": r.get("status"),
                "grid": int(r["grid"]) if r.get("grid") else None,
                "laps": r.get("laps"),
                "fastest_lap_time": r.get("fastest_lap_time"),
                "fastest_lap_rank": r.get("fastest_lap_rank"),
                "positions_gained": (int(r["grid"]) - pos) if r.get("grid") and r["grid"] != "0" else None,
            })

        # Try to get qualifying too
        qualifying = []
        try:
            qual_data = await self._jolpica.get_qualifying_results(season, round_num)
            for q in qual_data.get("qualifying", []):
                team = q["constructor"]
                qualifying.append({
                    "position": int(q["position"]),
                    "driver": f"{q['given_name']} {q['family_name']}",
                    "abbreviation": q["code"],
                    "team": team,
                    "team_color": TEAM_COLORS.get(team, "#888888"),
                    "q1": q.get("q1"),
                    "q2": q.get("q2"),
                    "q3": q.get("q3"),
                })
        except Exception as e:
            logger.warning(f"Round {round_num} qualifying failed: {e}")

        result = {
            "race_name": data["race_name"],
            "round": round_num,
            "circuit": data.get("circuit", ""),
            "date": data.get("date", ""),
            "results": results,
            "qualifying": qualifying,
            "warnings": warnings,
        }
        self._cache.set(cache_key, result, settings.cache_ttl_results)
        return result

    async def get_session_result(self, session_key: int) -> dict:
        """Placeholder for session-specific results via OpenF1."""
        return {
            "session_key": session_key,
            "session_name": "Unknown",
            "short_name": "UNK",
            "race_name": "",
            "results": [],
            "qualifying_segments": None,
            "warnings": ["Session results not yet implemented"],
        }
