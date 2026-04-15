import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)


class JolpicaClient:
    def __init__(self, http_client: httpx.AsyncClient, semaphore: asyncio.Semaphore) -> None:
        self._http = http_client
        self._sem = semaphore

    async def _get(self, path: str) -> dict:
        async with self._sem:
            resp = await self._http.get(path)
            resp.raise_for_status()
            return resp.json()

    async def get_schedule(self, season: int) -> list[dict]:
        data = await self._get(f"/{season}.json")
        return data["MRData"]["RaceTable"]["Races"]

    async def get_driver_standings(self, season: int) -> dict:
        data = await self._get(f"/{season}/driverStandings.json")
        standings_list = data["MRData"]["StandingsTable"]["StandingsLists"]
        if not standings_list:
            return {"round": "0", "drivers": []}
        sl = standings_list[0]
        return {
            "round": sl["round"],
            "drivers": [
                {
                    "position": d["position"],
                    "points": d["points"],
                    "wins": d["wins"],
                    "code": d["Driver"]["code"],
                    "given_name": d["Driver"]["givenName"],
                    "family_name": d["Driver"]["familyName"],
                    "constructor": d["Constructors"][0]["name"],
                }
                for d in sl["DriverStandings"]
            ],
        }

    async def get_constructor_standings(self, season: int) -> dict:
        data = await self._get(f"/{season}/constructorStandings.json")
        standings_list = data["MRData"]["StandingsTable"]["StandingsLists"]
        if not standings_list:
            return {"round": "0", "constructors": []}
        sl = standings_list[0]
        return {
            "round": sl["round"],
            "constructors": [
                {
                    "position": cs["position"],
                    "points": cs["points"],
                    "wins": cs["wins"],
                    "name": cs["Constructor"]["name"],
                }
                for cs in sl["ConstructorStandings"]
            ],
        }

    async def get_latest_results(self, season: int) -> dict:
        return await self._get_race_results(f"/{season}/last/results.json")

    async def get_round_results(self, season: int, round_num: int) -> dict:
        return await self._get_race_results(f"/{season}/{round_num}/results.json")

    async def get_qualifying_results(self, season: int, round_num: int) -> dict:
        data = await self._get(f"/{season}/{round_num}/qualifying.json")
        races = data["MRData"]["RaceTable"]["Races"]
        if not races:
            return {"race_name": "", "round": "0", "qualifying": []}
        race = races[0]
        return {
            "race_name": race["raceName"],
            "round": race["round"],
            "circuit": race.get("Circuit", {}).get("circuitName", ""),
            "date": race.get("date", ""),
            "qualifying": [
                {
                    "position": q["position"],
                    "code": q["Driver"]["code"],
                    "given_name": q["Driver"]["givenName"],
                    "family_name": q["Driver"]["familyName"],
                    "constructor": q["Constructor"]["name"],
                    "q1": q.get("Q1"),
                    "q2": q.get("Q2"),
                    "q3": q.get("Q3"),
                }
                for q in race.get("QualifyingResults", [])
            ],
        }

    async def get_all_season_results(self, season: int) -> list[dict]:
        """Fetch all race results for an entire season (paginated)."""
        all_races = []
        offset = 0
        while True:
            data = await self._get(f"/{season}/results.json?limit=100&offset={offset}")
            races = data["MRData"]["RaceTable"]["Races"]
            if not races:
                break
            for race in races:
                all_races.append({
                    "round": int(race["round"]),
                    "race_name": race["raceName"],
                    "results": [
                        {
                            "position": r["position"],
                            "code": r["Driver"]["code"],
                            "given_name": r["Driver"]["givenName"],
                            "family_name": r["Driver"]["familyName"],
                            "constructor": r["Constructor"]["name"],
                            "points": float(r["points"]),
                            "grid": r.get("grid"),
                            "status": r.get("status"),
                            "laps": r.get("laps"),
                        }
                        for r in race.get("Results", [])
                    ],
                })
            total = int(data["MRData"]["total"])
            offset += 100
            if offset >= total:
                break
        return all_races

    async def _get_race_results(self, path: str) -> dict:
        data = await self._get(path)
        races = data["MRData"]["RaceTable"]["Races"]
        if not races:
            return {"race_name": "", "round": "0", "results": []}
        race = races[0]
        return {
            "race_name": race["raceName"],
            "round": race["round"],
            "circuit": race.get("Circuit", {}).get("circuitName", ""),
            "date": race.get("date", ""),
            "results": [
                {
                    "position": r["position"],
                    "code": r["Driver"]["code"],
                    "given_name": r["Driver"]["givenName"],
                    "family_name": r["Driver"]["familyName"],
                    "constructor": r["Constructor"]["name"],
                    "time": r.get("Time", {}).get("time"),
                    "status": r.get("status"),
                    "grid": r.get("grid"),
                    "laps": r.get("laps"),
                    "fastest_lap_time": r.get("FastestLap", {}).get("Time", {}).get("time") if r.get("FastestLap") else None,
                    "fastest_lap_rank": r.get("FastestLap", {}).get("rank") if r.get("FastestLap") else None,
                }
                for r in race.get("Results", [])
            ],
        }
