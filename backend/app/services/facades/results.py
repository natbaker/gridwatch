import logging

from app.cache import TTLCache
from app.config import settings
from app.constants import TEAM_COLORS
from app.services.clients.jolpica import JolpicaClient

logger = logging.getLogger(__name__)

CURRENT_SEASON = 2026


class ResultsFacade:
    def __init__(self, jolpica: JolpicaClient, cache: TTLCache) -> None:
        self._jolpica = jolpica
        self._cache = cache

    def _map_qualifying_entries(self, qual_list: list[dict]) -> list[dict]:
        entries = []
        for q in qual_list:
            team = q["constructor"]
            entries.append({
                "position": int(q["position"]),
                "driver": f"{q['given_name']} {q['family_name']}",
                "abbreviation": q["code"],
                "team": team,
                "team_color": TEAM_COLORS.get(team, "#888888"),
                "q1": q.get("q1"),
                "q2": q.get("q2"),
                "q3": q.get("q3"),
            })
        return entries

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
            "date": data.get("date", ""),
            "results": results,
            "qualifying_segments": None,
            "warnings": warnings,
        }
        self._cache.set(cache_key, result, settings.cache_ttl_results)
        return result

    async def _resolve_jolpica_round(self, season: int, round_num: int, race_date: str | None) -> int:
        if not race_date:
            return round_num
        try:
            from datetime import date as date_type
            target_dt = date_type.fromisoformat(race_date[:10])
            schedule_key = f"jolpica_schedule_{season}"
            races = self._cache.get(schedule_key)
            if not races:
                races = await self._jolpica.get_schedule(season)
                self._cache.set(schedule_key, races, 3600)
            best = min(races, key=lambda r: abs((date_type.fromisoformat(r["date"]) - target_dt).days))
            return int(best["round"])
        except Exception as e:
            logger.warning(f"Could not resolve Jolpica round from date {race_date}: {e}")
            return round_num

    async def get_race_results(self, round_num: int, season: int = CURRENT_SEASON, race_date: str | None = None) -> dict:
        jolpica_round = await self._resolve_jolpica_round(season, round_num, race_date)
        cache_key = f"results_round_{season}_{jolpica_round}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []
        try:
            data = await self._jolpica.get_round_results(season, jolpica_round)
        except Exception as e:
            logger.warning(f"Round {round_num} results failed: {e}")
            stale = self._cache.get_stale(cache_key)
            if stale:
                stale["warnings"] = ["Using cached results"]
                return stale
            return {"race_name": "", "round": jolpica_round, "circuit": "", "date": "", "results": [], "qualifying": [], "warnings": ["Results unavailable"]}

        results = []
        for r in data["results"]:
            team = r["constructor"]
            pos = int(r["position"])
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
            qualifying = self._map_qualifying_entries(qual_data.get("qualifying", []))
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

    async def get_qualifying_results(self, round_num: int, season: int = CURRENT_SEASON, race_date: str | None = None) -> dict:
        jolpica_round = await self._resolve_jolpica_round(season, round_num, race_date)
        cache_key = f"results_qualifying_{season}_{jolpica_round}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []
        try:
            data = await self._jolpica.get_qualifying_results(season, jolpica_round)
        except Exception as e:
            logger.warning(f"Round {round_num} qualifying failed: {e}")
            stale = self._cache.get_stale(cache_key)
            if stale:
                stale["warnings"] = ["Using cached results"]
                return stale
            return {"race_name": "", "round": jolpica_round, "date": "", "qualifying": [], "warnings": ["Qualifying results unavailable"]}

        result = {
            "race_name": data["race_name"],
            "round": round_num,
            "date": data.get("date", ""),
            "qualifying": self._map_qualifying_entries(data.get("qualifying", [])),
            "warnings": warnings,
        }
        self._cache.set(cache_key, result, settings.cache_ttl_results)
        return result
