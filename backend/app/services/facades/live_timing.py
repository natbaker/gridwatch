import logging
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import httpx

from app.cache import TTLCache
from app.db import is_session_downloaded, get_session_data_start, get_downloaded_session_info, get_car_data, get_radio_events, get_locations
from app.services.clients.openf1 import OpenF1Client
from app.services.facades.standings import TEAM_COLORS

logger = logging.getLogger(__name__)

TIRE_COLORS = {
    "SOFT": "#FF3333",
    "MEDIUM": "#FFD700",
    "HARD": "#CCCCCC",
    "INTERMEDIATE": "#39B54A",
    "WET": "#0072CE",
}

TIRE_SHORT = {
    "SOFT": "S",
    "MEDIUM": "M",
    "HARD": "H",
    "INTERMEDIATE": "I",
    "WET": "W",
}


SVG_WIDTH = 400
SVG_HEIGHT = 300
SVG_PADDING = 20


def _gps_to_svg(x: float, y: float, bounds: dict) -> tuple[float, float]:
    """Convert raw GPS coordinate to SVG space, applying rotation if present."""
    if "rot_cx" in bounds:
        dx, dy = x - bounds["rot_cx"], y - bounds["rot_cy"]
        x = bounds["rot_cx"] + dx * bounds["rot_cos"] - dy * bounds["rot_sin"]
        y = bounds["rot_cy"] + dx * bounds["rot_sin"] + dy * bounds["rot_cos"]
    sx = round(bounds["offset_x"] + (x - bounds["min_x"]) * bounds["scale"], 1)
    sy = round(bounds["offset_y"] + (y - bounds["min_y"]) * bounds["scale"], 1)
    return sx, sy


class LiveTimingFacade:
    def __init__(self, openf1: OpenF1Client, cache: TTLCache, http_client: httpx.AsyncClient | None = None) -> None:
        self._openf1 = openf1
        self._cache = cache
        self._http = http_client

    async def get_session_key_for_round(self, year: int, round_num: int, session_type: str = "Race") -> dict:
        """Look up session key by year, round number, and session type."""
        cache_key = f"session_key_{year}_{round_num}_{session_type}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        try:
            meetings = await self._openf1.get_meetings(year)
            # Filter out non-race meetings (e.g. pre-season testing)
            race_meetings = [
                m for m in meetings
                if "test" not in m.get("meeting_name", "").lower()
            ]
            if round_num < 1 or round_num > len(race_meetings):
                return {"session_key": None, "error": "Round not found"}
            meeting = race_meetings[round_num - 1]
            meeting_key = meeting["meeting_key"]

            sessions = await self._openf1.get_sessions(meeting_key=str(meeting_key))
            # Prefer session_name match (e.g. "Race") over session_type match
            # because Sprint has session_type="Race" but session_name="Sprint"
            match = None
            for s in sessions:
                if s.get("session_name") == session_type:
                    match = s
                elif s.get("session_type") == session_type and match is None:
                    match = s
            if match:
                result = {"session_key": match["session_key"]}
                self._cache.set(cache_key, result, 3600)
                return result
            return {"session_key": None, "error": f"No {session_type} session found"}
        except Exception as e:
            logger.error(f"Failed to look up session key: {e}")
            return {"session_key": None, "error": str(e)}

    async def get_live_session(self) -> dict | None:
        """Find the currently live or most recent session."""
        cached = self._cache.get("live_session_info")
        if cached:
            return cached

        try:
            sessions = await self._openf1.get_sessions(meeting_key="latest")
        except Exception as e:
            logger.warning(f"Failed to fetch sessions: {e}")
            return self._cache.get_stale("live_session_info")

        if not sessions:
            return None

        now = datetime.now(timezone.utc)
        live = None
        most_recent = None

        for s in sessions:
            start = datetime.fromisoformat(s["date_start"])
            end_str = s.get("date_end")
            end = datetime.fromisoformat(end_str) if end_str else None

            if end and start <= now <= end:
                live = s
                break

            if end and end <= now:
                if most_recent is None or end > datetime.fromisoformat(most_recent["date_end"]):
                    most_recent = s

        chosen = live or most_recent
        if not chosen:
            # Pick the next upcoming
            upcoming = [s for s in sessions if datetime.fromisoformat(s["date_start"]) > now]
            chosen = upcoming[0] if upcoming else sessions[-1]

        result = {
            "session_key": chosen["session_key"],
            "session_name": chosen["session_name"],
            "session_type": chosen.get("session_type", ""),
            "circuit": chosen.get("circuit_short_name", ""),
            "country": chosen.get("country_name", ""),
            "date_start": chosen["date_start"],
            "date_end": chosen.get("date_end"),
            "is_live": live is not None,
        }
        self._cache.set("live_session_info", result, 30)
        return result

    async def get_timing_data(self, session_key: int | None = None) -> dict:
        """Get assembled live timing data for a session."""
        if session_key is None:
            session_info = await self.get_live_session()
            if not session_info:
                return {"session": None, "drivers": [], "pit_stops": [], "warnings": ["No active session"]}
            session_key = session_info["session_key"]
        else:
            session_info = None

        cache_key = f"live_timing_{session_key}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []

        # Fetch session info if we don't have it
        if session_info is None:
            try:
                sessions = await self._openf1.get_sessions(session_key=str(session_key))
                if sessions:
                    s = sessions[0]
                    now = datetime.now(timezone.utc)
                    start = datetime.fromisoformat(s["date_start"])
                    end_str = s.get("date_end")
                    end = datetime.fromisoformat(end_str) if end_str else None
                    session_info = {
                        "session_key": s["session_key"],
                        "session_name": s["session_name"],
                        "session_type": s.get("session_type", ""),
                        "circuit": s.get("circuit_short_name", ""),
                        "country": s.get("country_name", ""),
                        "date_start": s["date_start"],
                        "date_end": s.get("date_end"),
                        "is_live": end is not None and start <= now <= end,
                    }
            except Exception as e:
                logger.warning(f"Session info fetch failed: {e}")

        # Fetch all data in parallel-ish (sequential for simplicity, could use asyncio.gather)
        drivers_raw = []
        positions_raw = []
        intervals_raw = []
        laps_raw = []
        stints_raw = []
        pit_raw = []

        try:
            drivers_raw = await self._openf1.get_drivers(session_key)
        except Exception as e:
            logger.warning(f"Drivers fetch failed: {e}")
            warnings.append("Driver data unavailable")

        try:
            positions_raw = await self._openf1.get_positions(session_key)
        except Exception as e:
            logger.warning(f"Positions fetch failed: {e}")

        try:
            intervals_raw = await self._openf1.get_intervals(session_key)
        except Exception as e:
            logger.warning(f"Intervals fetch failed: {e}")

        try:
            laps_raw = await self._openf1.get_laps(session_key)
        except Exception as e:
            logger.warning(f"Laps fetch failed: {e}")

        try:
            stints_raw = await self._openf1.get_stints(session_key)
        except Exception as e:
            logger.warning(f"Stints fetch failed: {e}")

        try:
            pit_raw = await self._openf1.get_pit_stops(session_key)
        except Exception as e:
            logger.warning(f"Pit stops fetch failed: {e}")

        if not drivers_raw and not positions_raw:
            stale = self._cache.get_stale(cache_key)
            if stale:
                stale["warnings"] = ["Using cached timing data"]
                return stale
            return {
                "session": session_info,
                "drivers": [],
                "pit_stops": [],
                "warnings": warnings or ["No timing data available for this session"],
            }

        # Build driver lookup
        driver_map: dict[int, dict] = {}
        for d in drivers_raw:
            num = d.get("driver_number")
            if num is None:
                continue
            team = d.get("team_name", "")
            driver_map[num] = {
                "driver_number": num,
                "abbreviation": d.get("name_acronym", ""),
                "full_name": d.get("full_name", ""),
                "team": team,
                "team_color": f"#{d['team_colour']}" if d.get("team_colour") else TEAM_COLORS.get(team, "#888"),
                "country_code": d.get("country_code", ""),
            }

        # Latest position per driver
        latest_positions: dict[int, int] = {}
        for p in positions_raw:
            num = p.get("driver_number")
            if num is not None:
                latest_positions[num] = p.get("position", 0)

        # Latest interval per driver
        latest_intervals: dict[int, dict] = {}
        for iv in intervals_raw:
            num = iv.get("driver_number")
            if num is not None:
                latest_intervals[num] = {
                    "gap_to_leader": iv.get("gap_to_leader"),
                    "interval": iv.get("interval"),
                }

        # Latest lap per driver + best lap
        latest_laps: dict[int, dict] = {}
        best_laps: dict[int, float | None] = {}
        session_best_time: float | None = None

        for lap in laps_raw:
            num = lap.get("driver_number")
            if num is None:
                continue
            latest_laps[num] = {
                "lap_number": lap.get("lap_number"),
                "lap_duration": lap.get("lap_duration"),
                "is_pit_out_lap": lap.get("is_pit_out_lap", False),
                "sector_1": lap.get("duration_sector_1"),
                "sector_2": lap.get("duration_sector_2"),
                "sector_3": lap.get("duration_sector_3"),
            }
            duration = lap.get("lap_duration")
            if duration is not None and not lap.get("is_pit_out_lap"):
                current_best = best_laps.get(num)
                if current_best is None or duration < current_best:
                    best_laps[num] = duration
                if session_best_time is None or duration < session_best_time:
                    session_best_time = duration

        # Latest stint per driver
        latest_stints: dict[int, dict] = {}
        for stint in stints_raw:
            num = stint.get("driver_number")
            if num is None:
                continue
            compound = (stint.get("compound") or "").upper()
            latest_stints[num] = {
                "compound": compound,
                "compound_short": TIRE_SHORT.get(compound, "?"),
                "compound_color": TIRE_COLORS.get(compound, "#888"),
                "stint_number": stint.get("stint_number", 0),
                "lap_start": stint.get("lap_start"),
                "lap_end": stint.get("lap_end"),
                "tyre_age": stint.get("tyre_age_at_start", 0),
            }

        # Assemble driver timing entries
        all_nums = set(driver_map.keys()) | set(latest_positions.keys())
        timing_entries = []
        for num in all_nums:
            d = driver_map.get(num, {
                "driver_number": num,
                "abbreviation": str(num),
                "full_name": f"Driver {num}",
                "team": "",
                "team_color": "#888",
                "country_code": "",
            })
            lap = latest_laps.get(num, {})
            stint = latest_stints.get(num, {})
            interval = latest_intervals.get(num, {})
            personal_best = best_laps.get(num)

            lap_duration = lap.get("lap_duration")
            is_personal_best = lap_duration is not None and personal_best is not None and lap_duration <= personal_best
            is_session_best = lap_duration is not None and session_best_time is not None and lap_duration <= session_best_time

            timing_entries.append({
                "position": latest_positions.get(num, 0),
                "driver_number": num,
                "abbreviation": d["abbreviation"],
                "full_name": d["full_name"],
                "team": d["team"],
                "team_color": d["team_color"],
                "gap_to_leader": interval.get("gap_to_leader"),
                "interval": interval.get("interval"),
                "last_lap": lap_duration,
                "best_lap": personal_best,
                "is_personal_best": is_personal_best and not is_session_best,
                "is_session_best": is_session_best,
                "lap_number": lap.get("lap_number"),
                "sector_1": lap.get("sector_1"),
                "sector_2": lap.get("sector_2"),
                "sector_3": lap.get("sector_3"),
                "tire_compound": stint.get("compound", ""),
                "tire_compound_short": stint.get("compound_short", ""),
                "tire_compound_color": stint.get("compound_color", "#888"),
                "tire_age": stint.get("tyre_age", 0),
                "pit_count": sum(1 for p in pit_raw if p.get("driver_number") == num),
            })

        timing_entries.sort(key=lambda x: x["position"] if x["position"] > 0 else 999)

        # Build pit stop log — group consecutive laps per driver into one stop
        # (OpenF1 emits one record per lap the car spends in the pit lane)
        laps_by_driver: dict[int, list[dict]] = defaultdict(list)
        for p in pit_raw:
            num = p.get("driver_number")
            if num is not None:
                laps_by_driver[num].append(p)

        pit_stops = []
        for num, entries in laps_by_driver.items():
            d = driver_map.get(num, {})
            # Sort by lap number
            entries.sort(key=lambda x: x.get("lap_number") or 0)
            # Group consecutive laps into one stop
            groups: list[list[dict]] = []
            for e in entries:
                lap = e.get("lap_number") or 0
                if groups and (lap - (groups[-1][-1].get("lap_number") or 0)) <= 1:
                    groups[-1].append(e)
                else:
                    groups.append([e])
            # One entry per group: use the first lap's date/lap, best duration
            for group in groups:
                best_dur = next((e.get("pit_duration") for e in group if e.get("pit_duration")), None)
                pit_stops.append({
                    "driver_number": num,
                    "abbreviation": d.get("abbreviation", str(num)),
                    "team_color": d.get("team_color", "#888"),
                    "lap_number": group[0].get("lap_number"),
                    "pit_duration": best_dur,
                    "date": group[0].get("date"),
                })
        pit_stops.sort(key=lambda x: x.get("date") or "", reverse=True)

        result = {
            "session": session_info,
            "drivers": timing_entries,
            "pit_stops": pit_stops[:20],
            "session_best_lap": session_best_time,
            "total_laps": max((e.get("lap_number") or 0 for e in timing_entries), default=0),
            "warnings": warnings,
        }

        ttl = 5 if (session_info and session_info.get("is_live")) else 60
        self._cache.set(cache_key, result, ttl)
        return result

    # OpenF1 circuit_short_name → circuit_key mapping
    CIRCUIT_KEYS: dict[str, int] = {
        "Albert Park": 1, "Shanghai": 2, "Suzuka": 46, "Sakhir": 3,
        "Jeddah": 61, "Miami": 77, "Montreal": 7, "Monaco": 6,
        "Barcelona": 4, "Spielberg": 14, "Silverstone": 9,
        "Spa-Francorchamps": 13, "Budapest": 11, "Zandvoort": 63,
        "Monza": 18, "Baku": 56, "Singapore": 23, "Austin": 69,
        "Mexico City": 32, "São Paulo": 21, "Las Vegas": 79,
        "Lusail": 78, "Yas Island": 24, "Madrid": 80,
    }

    async def _fetch_circuit_info(self, session_key: int, circuit_name: str | None = None) -> dict | None:
        """Fetch circuit geometry from the Multiviewer API via circuit_info_url."""
        cache_key = f"circuit_info_{session_key}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        if not self._http:
            return None

        # Try OpenF1 → meeting → circuit_info_url first
        url = None
        circuit_key = None
        year = None
        try:
            sessions = await self._openf1.get_sessions(session_key=str(session_key))
            if sessions:
                meeting_key = sessions[0].get("meeting_key")
                circuit_key = sessions[0].get("circuit_key")
                year = sessions[0].get("year")
                if meeting_key:
                    meetings = await self._openf1.get_meetings_by_key(meeting_key)
                    if meetings:
                        url = meetings[0].get("circuit_info_url")
        except Exception as e:
            logger.warning(f"OpenF1 unavailable for circuit info: {e}")

        # Fallback: try Multiviewer directly with circuit_key from mapping
        if not url and circuit_name:
            for name, key in self.CIRCUIT_KEYS.items():
                if name.lower() in circuit_name.lower() or circuit_name.lower() in name.lower():
                    circuit_key = key
                    break
            if not year:
                year = datetime.now(timezone.utc).year

        if not url and circuit_key and year:
            url = f"https://api.multiviewer.app/api/v1/circuits/{circuit_key}/{year}"

        if not url:
            return None

        try:
            resp = await self._http.get(url, timeout=10.0)
            resp.raise_for_status()
            info = resp.json()

            if not info.get("x") or not info.get("y"):
                return None

            self._cache.set(cache_key, info, 86400)  # cache 24h
            return info
        except Exception as e:
            logger.warning(f"Failed to fetch circuit info: {e}")
            return None

    async def _get_track_bounds(self, session_key: int) -> dict | None:
        """Get and cache the coordinate bounds for a session's track."""
        bounds_key = f"track_bounds_{session_key}"
        cached = self._cache.get(bounds_key)
        if cached:
            return cached

        # Get session info — try OpenF1 first, fall back to local DB
        session = None
        circuit_name = None
        try:
            sessions = await self._openf1.get_sessions(session_key=str(session_key))
            if sessions:
                session = sessions[0]
                circuit_name = session.get("circuit_short_name")
        except Exception:
            pass

        if session:
            start_str = session.get("date_start")
            end_str = session.get("date_end")
        else:
            # Fall back to local DB for downloaded sessions
            local = get_downloaded_session_info(session_key)
            if local:
                start_str = local.get("data_start")
                circuit_name = local.get("circuit")
            else:
                start_str = None
            end_str = None

        if not start_str:
            return None

        start = datetime.fromisoformat(start_str)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = datetime.fromisoformat(end_str) if end_str else start + timedelta(hours=2)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)

        # Try Multiviewer circuit data first (precise official track geometry)
        circuit_info = await self._fetch_circuit_info(session_key, circuit_name)
        if circuit_info and circuit_info.get("x") and circuit_info.get("y"):
            return self._build_bounds_from_circuit_info(circuit_info, start, end, bounds_key)

        # Fallback: sample GPS data from mid-session
        if session:
            return await self._build_bounds_from_gps(session_key, session, start, end, bounds_key)
        return None

    def _build_bounds_from_circuit_info(self, info: dict, start: datetime, end: datetime, bounds_key: str) -> dict:
        """Build track bounds from Multiviewer circuit geometry."""
        raw_x = info["x"]
        raw_y = info["y"]
        rotation = info.get("rotation", 0)

        # Apply rotation around centroid
        cx = sum(raw_x) / len(raw_x)
        cy = sum(raw_y) / len(raw_y)
        rad = math.radians(rotation)
        cos_r, sin_r = math.cos(rad), math.sin(rad)

        pts = []
        for x, y in zip(raw_x, raw_y):
            dx, dy = x - cx, y - cy
            rx = cx + dx * cos_r - dy * sin_r
            ry = cy + dx * sin_r + dy * cos_r
            pts.append((rx, ry))

        all_x = [p[0] for p in pts]
        all_y = [p[1] for p in pts]
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        range_x = max_x - min_x or 1
        range_y = max_y - min_y or 1

        usable_w = SVG_WIDTH - 2 * SVG_PADDING
        usable_h = SVG_HEIGHT - 2 * SVG_PADDING
        scale = min(usable_w / range_x, usable_h / range_y)
        off_x = SVG_PADDING + (usable_w - range_x * scale) / 2
        off_y = SVG_PADDING + (usable_h - range_y * scale) / 2

        # Convert to SVG coordinates — path already starts at S/F line
        svg_pts = []
        for rx, ry in pts:
            sx = round(off_x + (rx - min_x) * scale, 1)
            sy = round(off_y + (ry - min_y) * scale, 1)
            svg_pts.append((sx, sy))

        parts = [f"{'M' if i == 0 else 'L'}{sx},{sy}" for i, (sx, sy) in enumerate(svg_pts)]
        parts.append("Z")
        track_path = " ".join(parts)

        # Build mini-sector SVG index mapping from miniSectorsIndexes
        # These are indices into the x/y arrays where each sector boundary falls
        sector_indices = info.get("miniSectorsIndexes", [])

        # Marshal sectors give us the 3 timing sector boundaries
        marshal_sectors = info.get("marshalSectors", [])

        # Corners for potential overlay
        corners = info.get("corners", [])
        corner_svgs = []
        for c in corners:
            tp = c.get("trackPosition", {})
            cx_raw, cy_raw = tp.get("x", 0), tp.get("y", 0)
            dx, dy = cx_raw - (sum(raw_x) / len(raw_x)), cy_raw - (sum(raw_y) / len(raw_y))
            rx = (sum(raw_x) / len(raw_x)) + dx * cos_r - dy * sin_r
            ry = (sum(raw_y) / len(raw_y)) + dx * sin_r + dy * cos_r
            corner_svgs.append({
                "number": c.get("number"),
                "x": round(off_x + (rx - min_x) * scale, 1),
                "y": round(off_y + (ry - min_y) * scale, 1),
            })

        bounds = {
            "min_x": min_x, "max_x": max_x,
            "min_y": min_y, "max_y": max_y,
            "session_start": start.isoformat(),
            "session_end": end.isoformat(),
            "track_path": track_path,
            "scale": scale,
            "offset_x": off_x,
            "offset_y": off_y,
            # Rotation params so car GPS coords get the same transform
            "rot_cx": cx, "rot_cy": cy,
            "rot_cos": cos_r, "rot_sin": sin_r,
            "sector_indices": sector_indices,
            "corners": corner_svgs,
        }
        self._cache.set(bounds_key, bounds, 3600)
        return bounds

    async def _build_bounds_from_gps(self, session_key: int, session: dict,
                                      start: datetime, end: datetime, bounds_key: str) -> dict | None:
        """Fallback: build track bounds from GPS location samples."""
        mid = start + (end - start) / 2
        sample_start = mid.isoformat()
        sample_end = (mid + timedelta(minutes=4)).isoformat()

        try:
            sample = await self._openf1.get_locations(
                session_key, date_gte=sample_start, date_lte=sample_end
            )
        except Exception:
            return None
        if not sample:
            return None

        by_driver: dict[int, list] = {}
        for p in sample:
            if p.get("x") and p.get("y"):
                num = p.get("driver_number")
                if num is not None:
                    by_driver.setdefault(num, []).append(p)

        best_driver = []
        for num, points in by_driver.items():
            xs = set(p["x"] for p in points)
            if len(xs) > 5 and len(points) > len(best_driver):
                best_driver = points
        if not best_driver:
            return None

        static_drivers = set()
        for num, points in by_driver.items():
            if len(set((p["x"], p["y"]) for p in points)) <= 1:
                static_drivers.add(num)

        all_valid = [p for p in sample if p.get("x") and p.get("y")
                     and p.get("driver_number") not in static_drivers]
        if not all_valid:
            all_valid = best_driver

        all_x = [p["x"] for p in all_valid]
        all_y = [p["y"] for p in all_valid]
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        range_x = max_x - min_x or 1
        range_y = max_y - min_y or 1

        usable_w = SVG_WIDTH - 2 * SVG_PADDING
        usable_h = SVG_HEIGHT - 2 * SVG_PADDING
        scale = min(usable_w / range_x, usable_h / range_y)
        off_x = SVG_PADDING + (usable_w - range_x * scale) / 2
        off_y = SVG_PADDING + (usable_h - range_y * scale) / 2

        lap_points = best_driver[:400]
        step = max(1, len(lap_points) // 150)
        path_points = lap_points[::step]

        track_path = ""
        if path_points:
            svg_pts = []
            for p in path_points:
                sx = round(off_x + (p["x"] - min_x) * scale, 1)
                sy = round(off_y + (p["y"] - min_y) * scale, 1)
                svg_pts.append((sx, sy))

            parts = [f"{'M' if i == 0 else 'L'}{sx},{sy}" for i, (sx, sy) in enumerate(svg_pts)]
            dx = svg_pts[-1][0] - svg_pts[0][0]
            dy = svg_pts[-1][1] - svg_pts[0][1]
            if (dx * dx + dy * dy) < 900:
                parts.append("Z")
            track_path = " ".join(parts)

        bounds = {
            "min_x": min_x, "max_x": max_x,
            "min_y": min_y, "max_y": max_y,
            "session_start": start.isoformat(),
            "session_end": end.isoformat(),
            "track_path": track_path,
            "scale": scale,
            "offset_x": off_x,
            "offset_y": off_y,
        }
        self._cache.set(bounds_key, bounds, 3600)
        return bounds

    async def get_car_locations(self, session_key: int | None = None) -> dict:
        """Get latest car positions on track, normalized to SVG viewbox coordinates."""
        if session_key is None:
            session_info = await self.get_live_session()
            if not session_info:
                return {"cars": [], "warnings": ["No active session"]}
            session_key = session_info["session_key"]

        cache_key = f"car_locations_{session_key}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        # Get track bounds (cached per session)
        bounds = await self._get_track_bounds(session_key)
        if not bounds:
            return {"cars": [], "warnings": ["No location data available"]}

        # Check if this is a live session or a finished one
        is_live = False
        try:
            live_info = await self.get_live_session()
            if live_info and live_info.get("session_key") == session_key and live_info.get("is_live"):
                is_live = True
        except Exception:
            pass

        raw = []
        if is_live:
            now = datetime.now(timezone.utc)
            recent_cutoff = (now - timedelta(seconds=10)).isoformat()
            try:
                raw = await self._openf1.get_locations(session_key, date_gte=recent_cutoff)
            except Exception as e:
                logger.debug(f"Location fetch failed (recent): {e}")

        if not raw:
            # Session finished — return track path only, no car positions
            # Cars will appear during replay playback
            result = {
                "cars": [],
                "warnings": [],
                "track_path": bounds.get("track_path", ""),
                "sector_indices": bounds.get("sector_indices", []),
                "corners": bounds.get("corners", []),
            }
            self._cache.set(cache_key, result, 60)
            return result

        if not raw:
            return {"cars": [], "warnings": ["No recent location data"]}

        # Get latest position per driver, track all positions to detect static GPS
        all_positions: dict[int, list] = {}
        latest: dict[int, dict] = {}
        for entry in raw:
            num = entry.get("driver_number")
            x = entry.get("x")
            y = entry.get("y")
            if num is not None and x is not None and y is not None and (x != 0 or y != 0):
                latest[num] = entry
                all_positions.setdefault(num, []).append((x, y))

        # Filter out drivers with static GPS (only 1 unique coordinate = not actually on track)
        for num in list(latest.keys()):
            coords = set(all_positions.get(num, []))
            if len(coords) <= 1:
                del latest[num]

        if not latest:
            return {"cars": [], "warnings": ["No valid positions"]}

        # Get driver info for colors (cached via timing data)
        try:
            drivers_raw = await self._openf1.get_drivers(session_key)
        except Exception:
            drivers_raw = []

        driver_info: dict[int, dict] = {}
        for d in drivers_raw:
            num = d.get("driver_number")
            if num is not None:
                team = d.get("team_name", "")
                driver_info[num] = {
                    "abbreviation": d.get("name_acronym", str(num)),
                    "team_color": f"#{d['team_colour']}" if d.get("team_colour") else TEAM_COLORS.get(team, "#888"),
                }

        cars = []
        for num, entry in latest.items():
            svg_x, svg_y = _gps_to_svg(entry["x"], entry["y"], bounds)
            info = driver_info.get(num, {"abbreviation": str(num), "team_color": "#888"})
            cars.append({
                "driver_number": num,
                "abbreviation": info["abbreviation"],
                "team_color": info["team_color"],
                "x": svg_x,
                "y": svg_y,
            })

        result = {
            "cars": cars,
            "warnings": [],
            "track_path": bounds.get("track_path", ""),
            "sector_indices": bounds.get("sector_indices", []),
            "corners": bounds.get("corners", []),
        }
        self._cache.set(cache_key, result, 2)
        return result

    async def _get_driver_info(self, session_key: int) -> dict[int, dict]:
        """Get driver abbreviations and team colors, cached."""
        cache_key = f"driver_info_{session_key}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        try:
            drivers_raw = await self._openf1.get_drivers(session_key)
        except Exception:
            drivers_raw = []

        info: dict[int, dict] = {}
        for d in drivers_raw:
            num = d.get("driver_number")
            if num is not None:
                team = d.get("team_name", "")
                info[num] = {
                    "abbreviation": d.get("name_acronym", str(num)),
                    "team_color": f"#{d['team_colour']}" if d.get("team_colour") else TEAM_COLORS.get(team, "#888"),
                }
        self._cache.set(cache_key, info, 300)
        return info

    async def get_replay_info(self, session_key: int) -> dict:
        """Get session metadata needed to start replay: time bounds, track path, driver info."""
        bounds = await self._get_track_bounds(session_key)
        if not bounds:
            return {"error": "No location data for this session"}

        driver_info = await self._get_driver_info(session_key)

        # Find actual data time range from the bounds driver's data
        # We stored last_date; for start, fetch from session info
        try:
            sessions = await self._openf1.get_sessions(session_key=str(session_key))
            session = sessions[0] if sessions else {}
        except Exception:
            session = {}

        data_start = session.get("date_start", "")
        data_end = bounds.get("last_date", session.get("date_end", ""))

        if not data_start:
            return {"error": "No session start time"}

        start_dt = datetime.fromisoformat(data_start)

        # Fetch position changes (sparse — ~25 per driver, only on position changes)
        try:
            positions_raw = await self._openf1.get_positions(session_key)
        except Exception:
            positions_raw = []

        position_events = []
        for p in positions_raw:
            date = p.get("date")
            num = p.get("driver_number")
            pos = p.get("position")
            if date and num and pos:
                t = (datetime.fromisoformat(date) - start_dt).total_seconds()
                if t >= 0:
                    position_events.append({"t": round(t, 1), "n": num, "p": pos})

        # Fetch interval data (more frequent, ~900 per driver)
        try:
            intervals_raw = await self._openf1.get_intervals(session_key)
        except Exception:
            intervals_raw = []

        # Downsample intervals — keep one per driver per ~5 seconds
        interval_events = []
        last_interval_t: dict[int, float] = {}
        for iv in intervals_raw:
            date = iv.get("date")
            num = iv.get("driver_number")
            if not date or not num:
                continue
            t = (datetime.fromisoformat(date) - start_dt).total_seconds()
            if t < 0:
                continue
            # Only keep if 5+ seconds since last for this driver
            if num in last_interval_t and t - last_interval_t[num] < 5:
                continue
            last_interval_t[num] = t
            gap = iv.get("gap_to_leader")
            interval = iv.get("interval")
            interval_events.append({
                "t": round(t, 1),
                "n": num,
                "g": round(gap, 3) if isinstance(gap, (int, float)) else None,
                "i": round(interval, 3) if isinstance(interval, (int, float)) else None,
            })

        # Fetch race control messages (flags, safety car, etc.)
        try:
            rc_raw = await self._openf1.get_race_control(session_key)
        except Exception:
            rc_raw = []

        race_control = []
        for rc in rc_raw:
            date = rc.get("date")
            if not date:
                continue
            t = (datetime.fromisoformat(date) - start_dt).total_seconds()
            category = rc.get("category", "")
            flag = rc.get("flag")
            message = rc.get("message", "")
            # Only include notable events
            if category in ("Flag", "SafetyCar", "Drs") or flag:
                rc_event: dict = {
                    "t": round(t, 1),
                    "category": category,
                    "flag": flag,
                    "message": message,
                }
                if rc.get("sector") is not None:
                    rc_event["sector"] = rc["sector"]
                race_control.append(rc_event)

        # Fetch lap completions for the leader to track current lap
        try:
            laps_raw = await self._openf1.get_laps(session_key)
        except Exception:
            laps_raw = []

        # Find leader's laps (driver in P1 at start, or just driver with most laps)
        # Use the first position event's leader, or take all laps from all drivers
        # and track the max lap number seen at each time
        lap_events = []
        seen_laps: set[int] = set()
        for lap in laps_raw:
            date = lap.get("date_start")
            lap_num = lap.get("lap_number")
            if not date or not lap_num:
                continue
            if lap_num in seen_laps:
                continue
            seen_laps.add(lap_num)
            t = (datetime.fromisoformat(date) - start_dt).total_seconds()
            if t >= 0:
                lap_events.append({"t": round(t, 1), "lap": lap_num})
        lap_events.sort(key=lambda e: e["t"])

        # Extract mini-sector counts per timing sector from first complete lap
        mini_sectors = [0, 0, 0]
        for lap in laps_raw:
            s1 = lap.get("segments_sector_1")
            s2 = lap.get("segments_sector_2")
            s3 = lap.get("segments_sector_3")
            if s1 and s2 and s3:
                mini_sectors = [len(s1), len(s2), len(s3)]
                break

        # Fetch trackside weather data
        try:
            weather_raw = await self._openf1.get_weather(session_key)
        except Exception:
            weather_raw = []

        weather_events = []
        for w in weather_raw:
            date = w.get("date")
            if not date:
                continue
            t = (datetime.fromisoformat(date) - start_dt).total_seconds()
            if t < 0:
                continue
            weather_events.append({
                "t": round(t, 1),
                "air_temp": w.get("air_temperature"),
                "track_temp": w.get("track_temperature"),
                "humidity": w.get("humidity"),
                "wind_speed": w.get("wind_speed"),
                "wind_direction": w.get("wind_direction"),
                "rainfall": w.get("rainfall", 0),
            })
        # Downsample weather — keep one per ~30 seconds
        if len(weather_events) > 200:
            sampled = []
            last_t = -30.0
            for w in weather_events:
                if w["t"] - last_t >= 30:
                    sampled.append(w)
                    last_t = w["t"]
            weather_events = sampled

        # Fetch pit stop events with timestamps
        try:
            pits_raw = await self._openf1.get_pit_stops(session_key)
        except Exception:
            pits_raw = []

        # Group consecutive lap entries per driver before building pit events
        _pit_by_driver: dict[int, list[dict]] = {}
        for p in pits_raw:
            num = p.get("driver_number")
            if num is not None:
                _pit_by_driver.setdefault(num, []).append(p)
        pits_deduped = []
        for num, entries in _pit_by_driver.items():
            entries.sort(key=lambda x: x.get("lap_number") or 0)
            groups: list[list[dict]] = []
            for e in entries:
                lap = e.get("lap_number") or 0
                if groups and (lap - (groups[-1][-1].get("lap_number") or 0)) <= 1:
                    groups[-1].append(e)
                else:
                    groups.append([e])
            for group in groups:
                best = next((e for e in group if e.get("pit_duration")), group[0])
                pits_deduped.append({**group[0], "pit_duration": best.get("pit_duration")})

        pit_events = []
        for p in pits_deduped:
            date = p.get("date")
            num = p.get("driver_number")
            duration = p.get("pit_duration")
            if not date or not num:
                continue
            t = (datetime.fromisoformat(date) - start_dt).total_seconds()
            if t < 0:
                continue
            pit_events.append({
                "t": round(t, 1),
                "n": num,
                "d": round(duration, 1) if duration else None,
                "lap": p.get("lap_number"),
            })

        # Fetch team radio events — prefer local DB
        radio_events = []
        if is_session_downloaded(session_key):
            for r in get_radio_events(session_key):
                if r["t"] >= 0:
                    radio_events.append({"t": r["t"], "n": r["driver_number"], "url": r["recording_url"]})
        else:
            try:
                radio_raw = await self._openf1.get_team_radio(session_key)
            except Exception:
                radio_raw = []
            for r in radio_raw:
                date = r.get("date")
                num = r.get("driver_number")
                url = r.get("recording_url")
                if not date or not num or not url:
                    continue
                t = (datetime.fromisoformat(date) - start_dt).total_seconds()
                if t >= 0:
                    radio_events.append({"t": round(t, 1), "n": num, "url": url})

        return {
            "session_key": session_key,
            "session_name": session.get("session_name", ""),
            "circuit": session.get("circuit_short_name", ""),
            "data_start": data_start,
            "data_end": data_end,
            "track_path": bounds.get("track_path", ""),
            "mini_sectors": mini_sectors,
            "sector_indices": bounds.get("sector_indices", []),
            "corners": bounds.get("corners", []),
            "drivers": {str(num): info for num, info in driver_info.items()},
            "position_events": position_events,
            "interval_events": interval_events,
            "race_control": race_control,
            "lap_events": lap_events,
            "pit_events": pit_events,
            "weather_events": weather_events,
            "radio_events": radio_events,
        }

    async def get_replay_positions(self, session_key: int, from_time: str, seconds: int = 30) -> dict:
        """Get normalized car positions for a time window, for replay playback."""
        bounds = await self._get_track_bounds(session_key)
        if not bounds:
            return {"positions": []}

        from_dt = datetime.fromisoformat(from_time)
        if from_dt.tzinfo is None:
            from_dt = from_dt.replace(tzinfo=timezone.utc)

        # Try local DB first
        data_start = get_session_data_start(session_key) if is_session_downloaded(session_key) else None
        if data_start:
            start_dt = datetime.fromisoformat(data_start)
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
            t_start = (from_dt - start_dt).total_seconds()
            t_end = t_start + seconds
            rows = get_locations(session_key, t_start, t_end)
            positions = []
            for row in rows:
                x, y = row["x"], row["y"]
                if x == 0 and y == 0:
                    continue
                svg_x, svg_y = _gps_to_svg(x, y, bounds)
                positions.append({
                    "t": round(row["t"] - t_start, 2),
                    "n": row["driver_number"],
                    "x": svg_x,
                    "y": svg_y,
                })
            return {"positions": positions, "track_path": bounds.get("track_path", "")}

        # Fall back to OpenF1 API
        to_dt = from_dt + timedelta(seconds=seconds)

        try:
            raw = await self._openf1.get_locations(
                session_key, date_gte=from_time, date_lte=to_dt.isoformat()
            )
        except Exception:
            raw = []

        if not raw:
            return {"positions": []}

        # Detect static GPS drivers (all points at same coordinate)
        driver_coords: dict[int, set] = {}
        for entry in raw:
            num = entry.get("driver_number")
            x, y = entry.get("x"), entry.get("y")
            if num is not None and x is not None and y is not None:
                driver_coords.setdefault(num, set()).add((x, y))
        static_drivers = {num for num, coords in driver_coords.items() if len(coords) <= 1}

        # Normalize positions and compute time offset from from_time
        positions = []
        for entry in raw:
            x = entry.get("x")
            y = entry.get("y")
            num = entry.get("driver_number")
            date = entry.get("date")
            if x is None or y is None or num is None or date is None:
                continue
            if x == 0 and y == 0:
                continue
            if num in static_drivers:
                continue

            t = (datetime.fromisoformat(date) - from_dt).total_seconds()
            svg_x, svg_y = _gps_to_svg(x, y, bounds)
            positions.append({
                "t": round(t, 2),
                "n": num,
                "x": svg_x,
                "y": svg_y,
            })

        return {"positions": positions}

    async def get_car_telemetry(self, session_key: int, driver_number: int,
                                from_time: str, seconds: int = 30) -> dict:
        """Get car telemetry (throttle/brake/speed/rpm/gear/drs) for a time window."""
        from_dt = datetime.fromisoformat(from_time)
        if from_dt.tzinfo is None:
            from_dt = from_dt.replace(tzinfo=timezone.utc)

        # Try local DB first
        data_start = get_session_data_start(session_key) if is_session_downloaded(session_key) else None
        if data_start:
            start_dt = datetime.fromisoformat(data_start)
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
            t_start = (from_dt - start_dt).total_seconds()
            t_end = t_start + seconds
            rows = get_car_data(session_key, driver_number, t_start, t_end)
            samples = [{
                "t": round(row["t"] - t_start, 2),
                "spd": row["speed"] or 0,
                "thr": row["throttle"] or 0,
                "brk": row["brake"] or 0,
                "rpm": row["rpm"] or 0,
                "gear": row["gear"] or 0,
                "drs": row["drs"] or 0,
            } for row in rows]
            return {"samples": samples}

        # Fall back to OpenF1 API
        to_dt = from_dt + timedelta(seconds=seconds)
        try:
            raw = await self._openf1.get_car_data(
                session_key, driver_number,
                date_gte=from_time, date_lte=to_dt.isoformat()
            )
        except Exception:
            raw = []

        samples = []
        for entry in raw:
            date = entry.get("date")
            if not date:
                continue
            t = (datetime.fromisoformat(date) - from_dt).total_seconds()
            samples.append({
                "t": round(t, 2),
                "spd": entry.get("speed", 0),
                "thr": entry.get("throttle", 0),
                "brk": entry.get("brake", 0),
                "rpm": entry.get("rpm", 0),
                "gear": entry.get("n_gear", 0),
                "drs": entry.get("drs") or 0,
            })

        return {"samples": samples}

    async def get_lap_telemetry(self, session_key: int, driver_number: int,
                                lap_preset: str = "fastest") -> dict:
        """Get normalized telemetry for a specific lap preset (fastest/last/first).

        Returns speed/throttle/brake channels normalized to 0-100% lap distance.
        Only works with locally cached session data.
        """
        import math
        from app.db import get_session_data_start, is_session_downloaded, get_car_data, get_driver_locations

        if not is_session_downloaded(session_key):
            return {"error": "Session data not downloaded"}

        data_start = get_session_data_start(session_key)
        if not data_start:
            return {"error": "No session start time"}

        start_dt = datetime.fromisoformat(data_start)
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)

        # Fetch all laps for this driver from OpenF1
        try:
            laps = await self._openf1.get_laps(session_key, driver_number=driver_number)
        except Exception:
            laps = []

        # Filter to laps with a valid duration and date_start
        valid_laps = [
            lap for lap in laps
            if lap.get("lap_duration") and lap.get("date_start") and lap.get("lap_number")
        ]

        if not valid_laps:
            return {"error": "No lap data available"}

        # Resolve preset to a specific lap
        if lap_preset == "fastest":
            chosen = min(valid_laps, key=lambda l: l["lap_duration"])
        elif lap_preset == "last":
            chosen = max(valid_laps, key=lambda l: l["lap_number"])
        elif lap_preset == "first":
            # Skip lap 1 if there's a lap 2 (lap 1 is often an out-lap)
            by_num = sorted(valid_laps, key=lambda l: l["lap_number"])
            chosen = by_num[1] if len(by_num) > 1 and by_num[0]["lap_number"] == 1 else by_num[0]
        else:
            return {"error": f"Invalid lap preset: {lap_preset}"}

        lap_number = chosen["lap_number"]
        lap_duration = chosen["lap_duration"]
        lap_start_dt = datetime.fromisoformat(chosen["date_start"])
        if lap_start_dt.tzinfo is None:
            lap_start_dt = lap_start_dt.replace(tzinfo=timezone.utc)

        # Time offsets relative to session start
        t_start = (lap_start_dt - start_dt).total_seconds()
        t_end = t_start + lap_duration

        # Fetch car_data and locations for this time window
        car_rows = get_car_data(session_key, driver_number, t_start, t_end)
        loc_rows = get_driver_locations(session_key, driver_number, t_start, t_end)

        if not car_rows:
            return {"error": "No telemetry for this lap"}

        # Compute cumulative distance from location data
        cum_dist = [0.0]
        for i in range(1, len(loc_rows)):
            dx = loc_rows[i]["x"] - loc_rows[i - 1]["x"]
            dy = loc_rows[i]["y"] - loc_rows[i - 1]["y"]
            cum_dist.append(cum_dist[-1] + math.sqrt(dx * dx + dy * dy))

        total_dist = cum_dist[-1] if cum_dist[-1] > 0 else 1.0

        # Build a time → distance_pct lookup from locations
        loc_times = [row["t"] for row in loc_rows]
        loc_dist_pct = [d / total_dist * 100.0 for d in cum_dist]

        # Generic linear interpolation helper
        def interp1d(xs: list, ys: list, x: float) -> float:
            if not xs:
                return 0.0
            if x <= xs[0]:
                return ys[0]
            if x >= xs[-1]:
                return ys[-1]
            lo, hi = 0, len(xs) - 1
            while lo < hi - 1:
                mid = (lo + hi) // 2
                if xs[mid] <= x:
                    lo = mid
                else:
                    hi = mid
            frac = (x - xs[lo]) / (xs[hi] - xs[lo]) if xs[hi] != xs[lo] else 0.0
            return ys[lo] + frac * (ys[hi] - ys[lo])

        # Compute distance_pct for each car_data point, then resample onto a
        # fixed 0.5% distance grid. Both drivers always output [0.0, 0.5, ...,
        # 100.0] so the frontend Map merge produces combined rows (not alternating).
        raw_dist_times = [t - t_start for t in loc_times]
        car_dists = [
            interp1d(raw_dist_times, loc_dist_pct, row["t"] - t_start)
            for row in car_rows
        ]
        raw_speed = [row["speed"] or 0 for row in car_rows]
        raw_throttle = [row["throttle"] or 0 for row in car_rows]
        raw_brake = [row["brake"] or 0 for row in car_rows]

        # Sort by distance in case GPS data is non-monotonic
        combined = sorted(zip(car_dists, raw_speed, raw_throttle, raw_brake))
        car_dists = [p[0] for p in combined]
        raw_speed = [p[1] for p in combined]
        raw_throttle = [p[2] for p in combined]
        raw_brake = [p[3] for p in combined]

        STEP = 0.5
        dist_pct_out = []
        speed_out = []
        throttle_out = []
        brake_out = []

        d = 0.0
        while d <= 100.0 + 1e-9:
            ds = round(d, 1)
            dist_pct_out.append(ds)
            speed_out.append(round(interp1d(car_dists, raw_speed, ds)))
            throttle_out.append(round(interp1d(car_dists, raw_throttle, ds)))
            brake_out.append(round(interp1d(car_dists, raw_brake, ds)))
            d += STEP

        # Format lap time as "M:SS.mmm"
        mins = int(lap_duration // 60)
        secs = lap_duration - mins * 60
        lap_time_str = f"{mins}:{secs:06.3f}"

        return {
            "driver_number": driver_number,
            "lap_number": lap_number,
            "lap_time": lap_time_str,
            "lap_preset": lap_preset,
            "channels": {
                "distance_pct": dist_pct_out,
                "speed": speed_out,
                "throttle": throttle_out,
                "brake": brake_out,
            },
        }
