import logging
import random
from collections import defaultdict

from app.cache import TTLCache
from app.config import settings
from app.services.clients.jolpica import JolpicaClient
from app.services.facades.standings import TEAM_COLORS

logger = logging.getLogger(__name__)

CURRENT_SEASON = 2026


class AnalyticsFacade:
    def __init__(self, jolpica: JolpicaClient, cache: TTLCache) -> None:
        self._jolpica = jolpica
        self._cache = cache

    async def get_season_progression(self, season: int = CURRENT_SEASON) -> dict:
        cache_key = f"analytics_progression_{season}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        try:
            all_races = await self._jolpica.get_all_season_results(season)
        except Exception as e:
            logger.warning(f"Season results fetch failed: {e}")
            stale = self._cache.get_stale(cache_key)
            if stale:
                return stale
            return {"season": season, "rounds": [], "drivers": [], "constructors": [], "warnings": ["Data unavailable"]}

        if not all_races:
            return {"season": season, "rounds": [], "drivers": [], "constructors": [], "warnings": ["No race data"]}

        # Build cumulative points per driver and constructor
        driver_points: dict[str, list[dict]] = defaultdict(list)
        driver_info: dict[str, dict] = {}
        constructor_points: dict[str, list[dict]] = defaultdict(list)
        constructor_info: dict[str, dict] = {}
        rounds = []

        # Track cumulative totals
        driver_cumulative: dict[str, float] = defaultdict(float)
        constructor_cumulative: dict[str, float] = defaultdict(float)

        for race in sorted(all_races, key=lambda r: r["round"]):
            round_num = race["round"]
            rounds.append({"round": round_num, "name": race["race_name"]})

            # Per-constructor round accumulator
            constructor_round: dict[str, float] = defaultdict(float)

            for r in race["results"]:
                code = r["code"]
                team = r["constructor"]
                pts = r["points"]
                pos = int(r["position"])
                grid = int(r["grid"]) if r.get("grid") and r["grid"] != "0" else None

                driver_cumulative[code] += pts
                constructor_round[team] += pts

                if code not in driver_info:
                    driver_info[code] = {
                        "code": code,
                        "name": f"{r['given_name']} {r['family_name']}",
                        "team": team,
                        "team_color": TEAM_COLORS.get(team, "#888"),
                    }

                driver_points[code].append({
                    "round": round_num,
                    "points": driver_cumulative[code],
                    "position": pos,
                    "grid": grid,
                    "positions_gained": (grid - pos) if grid else None,
                    "dnf": r.get("status") not in (None, "Finished") and not (r.get("status", "").startswith("+")),
                })

            for team, pts in constructor_round.items():
                constructor_cumulative[team] += pts
                if team not in constructor_info:
                    constructor_info[team] = {
                        "name": team,
                        "team_color": TEAM_COLORS.get(team, "#888"),
                    }
                constructor_points[team].append({
                    "round": round_num,
                    "points": constructor_cumulative[team],
                })

        # Build driver series sorted by final points
        drivers = []
        for code, info in sorted(driver_info.items(), key=lambda x: driver_cumulative[x[0]], reverse=True):
            drivers.append({
                **info,
                "total_points": driver_cumulative[code],
                "progression": driver_points[code],
            })

        constructors = []
        for name, info in sorted(constructor_info.items(), key=lambda x: constructor_cumulative[x[0]], reverse=True):
            constructors.append({
                **info,
                "total_points": constructor_cumulative[name],
                "progression": constructor_points[name],
            })

        result = {
            "season": season,
            "rounds": rounds,
            "drivers": drivers,
            "constructors": constructors,
            "warnings": [],
        }
        self._cache.set(cache_key, result, settings.cache_ttl_results)
        return result

    async def get_driver_stats(self, driver_code: str, season: int = CURRENT_SEASON) -> dict:
        """Detailed stats for a single driver across the season."""
        progression = await self.get_season_progression(season)

        driver = None
        for d in progression["drivers"]:
            if d["code"] == driver_code.upper():
                driver = d
                break

        if not driver:
            return {"driver": None, "warnings": [f"Driver {driver_code} not found in {season}"]}

        prog = driver["progression"]
        finishes = [r["position"] for r in prog]
        grids = [r["grid"] for r in prog if r["grid"] is not None]
        gains = [r["positions_gained"] for r in prog if r["positions_gained"] is not None]
        dnfs = sum(1 for r in prog if r["dnf"])

        # Find teammate
        teammate = None
        for d in progression["drivers"]:
            if d["code"] != driver["code"] and d["team"] == driver["team"]:
                teammate = d
                break

        h2h_wins = 0
        h2h_total = 0
        if teammate:
            tm_positions = {r["round"]: r["position"] for r in teammate["progression"]}
            for r in prog:
                if r["round"] in tm_positions:
                    h2h_total += 1
                    if r["position"] < tm_positions[r["round"]]:
                        h2h_wins += 1

        return {
            "driver": {
                "code": driver["code"],
                "name": driver["name"],
                "team": driver["team"],
                "team_color": driver["team_color"],
                "total_points": driver["total_points"],
                "races": len(prog),
                "wins": sum(1 for p in finishes if p == 1),
                "podiums": sum(1 for p in finishes if p <= 3),
                "top_10": sum(1 for p in finishes if p <= 10),
                "dnfs": dnfs,
                "best_finish": min(finishes) if finishes else None,
                "avg_finish": round(sum(finishes) / len(finishes), 1) if finishes else None,
                "avg_grid": round(sum(grids) / len(grids), 1) if grids else None,
                "avg_positions_gained": round(sum(gains) / len(gains), 1) if gains else None,
                "teammate": {
                    "code": teammate["code"],
                    "name": teammate["name"],
                    "total_points": teammate["total_points"],
                    "h2h": f"{h2h_wins}-{h2h_total - h2h_wins}",
                } if teammate else None,
                "progression": prog,
            },
            "warnings": [],
        }

    async def get_predictions(self, season: int = CURRENT_SEASON) -> dict:
        """Statistical analysis and predictions based on season data."""
        progression = await self.get_season_progression(season)

        if not progression["drivers"]:
            return {"season": season, "total_rounds": 0, "championship_probabilities": [],
                    "form_guide": [], "teammate_battles": [], "insights": [],
                    "projections": [], "dnf_rates": [], "warnings": ["No data"]}

        rounds = progression["rounds"]
        total_rounds = len(rounds)
        drivers = progression["drivers"]
        estimated_season_length = 24

        # ── Championship probability (Monte Carlo) ──
        championship_probs = self._simulate_championship(
            drivers, total_rounds, estimated_season_length, n_simulations=10000
        )

        # ── Form guide (last 5 races vs season average) ──
        form_guide = self._compute_form_guide(drivers, window=5)

        # ── Teammate battles ──
        teammate_battles = self._compute_teammate_battles(drivers)

        # ── Qualifying vs Race (race craft) ──
        quali_race_data = []
        for d in drivers[:15]:
            grids = []
            finishes = []
            for r in d["progression"]:
                if r["grid"] is not None:
                    grids.append(r["grid"])
                    finishes.append(r["position"])
            if len(grids) >= 2:
                avg_gain = sum(g - f for g, f in zip(grids, finishes)) / len(grids)
                avg_finish = sum(finishes) / len(finishes)
                std_dev = (sum((f - avg_finish)**2 for f in finishes) / len(finishes)) ** 0.5
                quali_race_data.append({
                    "code": d["code"],
                    "name": d["name"],
                    "team": d["team"],
                    "team_color": d["team_color"],
                    "avg_grid": round(sum(grids) / len(grids), 1),
                    "avg_finish": round(avg_finish, 1),
                    "avg_gain": round(avg_gain, 1),
                    "consistency": round(std_dev, 1),
                })

        insights = []

        race_craft = sorted(quali_race_data, key=lambda x: x["avg_gain"], reverse=True)
        if race_craft:
            insights.append({
                "type": "race_craft",
                "title": "Best Race Craft (Avg Positions Gained)",
                "data": race_craft[:5],
            })

        consistency = sorted(quali_race_data, key=lambda x: x["consistency"])
        if consistency:
            insights.append({
                "type": "consistency",
                "title": "Most Consistent Finisher",
                "data": consistency[:5],
            })

        # Constructor pace
        constructor_pace = []
        for c in progression["constructors"]:
            races = len(c["progression"])
            if races > 0:
                constructor_pace.append({
                    "name": c["name"],
                    "team_color": c["team_color"],
                    "total_points": c["total_points"],
                    "avg_points_per_race": round(c["total_points"] / races, 1),
                    "races": races,
                })
        constructor_pace.sort(key=lambda x: x["avg_points_per_race"], reverse=True)
        insights.append({
            "type": "constructor_pace",
            "title": "Constructor Pace (Avg Points Per Race)",
            "data": constructor_pace,
        })

        # DNF rates
        dnf_data = []
        for d in drivers:
            dnfs = sum(1 for r in d["progression"] if r["dnf"])
            races = len(d["progression"])
            if races >= 2:
                dnf_data.append({
                    "code": d["code"],
                    "name": d["name"],
                    "team_color": d["team_color"],
                    "dnfs": dnfs,
                    "races": races,
                    "dnf_rate": round(dnfs / races * 100, 1),
                })

        # Projections
        projections = []
        if total_rounds < estimated_season_length:
            for d in drivers[:10]:
                if d["progression"]:
                    pts_per_race = d["total_points"] / len(d["progression"])
                    projected = round(pts_per_race * estimated_season_length, 0)
                    projections.append({
                        "code": d["code"],
                        "name": d["name"],
                        "team_color": d["team_color"],
                        "current_points": d["total_points"],
                        "projected_points": projected,
                        "races_remaining": estimated_season_length - total_rounds,
                    })

        return {
            "season": season,
            "total_rounds": total_rounds,
            "championship_probabilities": championship_probs,
            "form_guide": form_guide,
            "teammate_battles": teammate_battles,
            "insights": insights,
            "projections": projections,
            "dnf_rates": sorted(dnf_data, key=lambda x: x["dnf_rate"], reverse=True)[:10],
            "warnings": [],
        }

    def _simulate_championship(
        self, drivers: list[dict], completed_rounds: int,
        total_rounds: int, n_simulations: int = 10000
    ) -> list[dict]:
        """Monte Carlo championship simulation based on recent form."""
        if completed_rounds >= total_rounds or completed_rounds < 2:
            # For completed seasons, just return actual standings
            return [{
                "code": d["code"],
                "name": d["name"],
                "team_color": d["team_color"],
                "current_points": d["total_points"],
                "win_probability": 100.0 if i == 0 else 0.0,
                "podium_probability": 100.0 if i < 3 else 0.0,
                "avg_projected_points": d["total_points"],
            } for i, d in enumerate(drivers[:10])]

        remaining = total_rounds - completed_rounds
        points_system = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

        # Build per-driver finish distributions from recent races
        driver_distributions: dict[str, list[int]] = {}
        for d in drivers:
            finishes = [r["position"] for r in d["progression"]]
            # Weight recent races more (last 5 get double weight)
            recent = finishes[-5:] if len(finishes) >= 5 else finishes
            weighted = finishes + recent  # Recent races appear twice
            driver_distributions[d["code"]] = weighted

        # Run simulations
        win_counts: dict[str, int] = defaultdict(int)
        podium_counts: dict[str, int] = defaultdict(int)
        total_points_sims: dict[str, list[float]] = defaultdict(list)

        top_codes = [d["code"] for d in drivers[:20]]

        rng = random.Random(42)  # Deterministic for caching

        for _ in range(n_simulations):
            sim_points = {d["code"]: d["total_points"] for d in drivers}

            for _ in range(remaining):
                # Sample finishes for each driver from their distribution
                sampled = {}
                for code in top_codes:
                    dist = driver_distributions.get(code, [15])
                    sampled[code] = rng.choice(dist)

                # Resolve ties by randomizing, then assign points by rank
                ranked = sorted(sampled.items(), key=lambda x: (x[1], rng.random()))
                for rank_idx, (code, _) in enumerate(ranked):
                    if rank_idx < len(points_system):
                        sim_points[code] += points_system[rank_idx]

            # Find winner
            final_standings = sorted(top_codes, key=lambda c: sim_points[c], reverse=True)
            win_counts[final_standings[0]] += 1
            for c in final_standings[:3]:
                podium_counts[c] += 1
            for c in top_codes:
                total_points_sims[c].append(sim_points[c])

        result = []
        for d in drivers[:10]:
            code = d["code"]
            pts_list = total_points_sims.get(code, [d["total_points"]])
            result.append({
                "code": code,
                "name": d["name"],
                "team": d["team"],
                "team_color": d["team_color"],
                "current_points": d["total_points"],
                "win_probability": round(win_counts.get(code, 0) / n_simulations * 100, 1),
                "podium_probability": round(podium_counts.get(code, 0) / n_simulations * 100, 1),
                "avg_projected_points": round(sum(pts_list) / len(pts_list), 0),
                "p10_points": round(sorted(pts_list)[int(len(pts_list) * 0.1)], 0),
                "p90_points": round(sorted(pts_list)[int(len(pts_list) * 0.9)], 0),
            })

        return sorted(result, key=lambda x: x["win_probability"], reverse=True)

    def _compute_form_guide(self, drivers: list[dict], window: int = 5) -> list[dict]:
        """Compare recent form (last N races) to season average."""
        form = []
        for d in drivers[:15]:
            prog = d["progression"]
            if len(prog) < 3:
                continue

            all_points = [0.0] * len(prog)
            for i, r in enumerate(prog):
                prev = prog[i-1]["points"] if i > 0 else 0
                all_points[i] = r["points"] - prev  # Points scored in this race

            season_avg = sum(all_points) / len(all_points)
            recent = all_points[-window:]
            recent_avg = sum(recent) / len(recent)

            all_finishes = [r["position"] for r in prog]
            recent_finishes = all_finishes[-window:]
            season_avg_finish = sum(all_finishes) / len(all_finishes)
            recent_avg_finish = sum(recent_finishes) / len(recent_finishes)

            trend = recent_avg - season_avg
            finish_trend = season_avg_finish - recent_avg_finish  # Positive = finishing higher recently

            form.append({
                "code": d["code"],
                "name": d["name"],
                "team": d["team"],
                "team_color": d["team_color"],
                "season_avg_points": round(season_avg, 1),
                "recent_avg_points": round(recent_avg, 1),
                "points_trend": round(trend, 1),
                "season_avg_finish": round(season_avg_finish, 1),
                "recent_avg_finish": round(recent_avg_finish, 1),
                "finish_trend": round(finish_trend, 1),
                "trending": "up" if trend > 1 else ("down" if trend < -1 else "stable"),
                "recent_results": [{"round": r["round"], "position": r["position"], "points": all_points[i]}
                                   for i, r in enumerate(prog[-window:])],
            })

        return sorted(form, key=lambda x: x["points_trend"], reverse=True)

    def _compute_teammate_battles(self, drivers: list[dict]) -> list[dict]:
        """Head-to-head teammate comparisons."""
        # Group by team
        teams: dict[str, list[dict]] = defaultdict(list)
        for d in drivers:
            teams[d["team"]].append(d)

        battles = []
        for team, members in teams.items():
            if len(members) < 2:
                continue
            # Sort by points, compare top 2
            members.sort(key=lambda x: x["total_points"], reverse=True)
            d1, d2 = members[0], members[1]

            # Build per-round position lookup
            d1_rounds = {r["round"]: r for r in d1["progression"]}
            d2_rounds = {r["round"]: r for r in d2["progression"]}
            common_rounds = set(d1_rounds.keys()) & set(d2_rounds.keys())

            if not common_rounds:
                continue

            d1_wins = sum(1 for r in common_rounds if d1_rounds[r]["position"] < d2_rounds[r]["position"])
            d2_wins = len(common_rounds) - d1_wins

            # Qualifying comparison (grid positions)
            d1_quali_wins = 0
            d2_quali_wins = 0
            for r in common_rounds:
                g1 = d1_rounds[r].get("grid")
                g2 = d2_rounds[r].get("grid")
                if g1 is not None and g2 is not None:
                    if g1 < g2:
                        d1_quali_wins += 1
                    elif g2 < g1:
                        d2_quali_wins += 1

            battles.append({
                "team": team,
                "team_color": d1["team_color"],
                "driver_1": {
                    "code": d1["code"],
                    "name": d1["name"],
                    "points": d1["total_points"],
                    "race_wins": d1_wins,
                    "quali_wins": d1_quali_wins,
                },
                "driver_2": {
                    "code": d2["code"],
                    "name": d2["name"],
                    "points": d2["total_points"],
                    "race_wins": d2_wins,
                    "quali_wins": d2_quali_wins,
                },
                "total_races": len(common_rounds),
                "points_gap": round(d1["total_points"] - d2["total_points"], 0),
                "dominance": round(d1_wins / len(common_rounds) * 100, 0) if common_rounds else 50,
            })

        return sorted(battles, key=lambda x: x["points_gap"], reverse=True)
