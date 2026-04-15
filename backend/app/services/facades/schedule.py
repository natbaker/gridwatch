import logging
from datetime import datetime, timedelta, timezone

from app.cache import TTLCache
from app.circuits import CIRCUITS, get_circuit_by_name
from app.config import settings
from app.db import get_downloaded_sessions
from app.services.clients.jolpica import JolpicaClient
from app.services.clients.openf1 import OpenF1Client

logger = logging.getLogger(__name__)

CURRENT_SEASON = 2026

FALLBACK_SCHEDULE = [
    {"round": 1, "name": "Australian Grand Prix", "city": "Melbourne", "country": "Australia", "circuit_key": "albert_park", "date_start": "2026-03-06", "date_end": "2026-03-08", "race_date": "2026-03-08T05:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 2, "name": "Chinese Grand Prix", "city": "Shanghai", "country": "China", "circuit_key": "shanghai", "date_start": "2026-03-13", "date_end": "2026-03-15", "race_date": "2026-03-15T07:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 3, "name": "Japanese Grand Prix", "city": "Suzuka", "country": "Japan", "circuit_key": "suzuka", "date_start": "2026-03-27", "date_end": "2026-03-29", "race_date": "2026-03-29T05:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 4, "name": "Bahrain Grand Prix", "city": "Sakhir", "country": "Bahrain", "circuit_key": "sakhir", "date_start": "2026-04-10", "date_end": "2026-04-12", "race_date": "2026-04-12T15:00:00Z", "is_sprint": False, "cancelled": True},
    {"round": 5, "name": "Saudi Arabian Grand Prix", "city": "Jeddah", "country": "Saudi Arabia", "circuit_key": "jeddah", "date_start": "2026-04-17", "date_end": "2026-04-19", "race_date": "2026-04-19T17:00:00Z", "is_sprint": False, "cancelled": True},
    {"round": 6, "name": "Miami Grand Prix", "city": "Miami", "country": "USA", "circuit_key": "miami", "date_start": "2026-05-01", "date_end": "2026-05-03", "race_date": "2026-05-03T20:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 7, "name": "Canadian Grand Prix", "city": "Montreal", "country": "Canada", "circuit_key": "montreal", "date_start": "2026-05-22", "date_end": "2026-05-24", "race_date": "2026-05-24T18:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 8, "name": "Monaco Grand Prix", "city": "Monte Carlo", "country": "Monaco", "circuit_key": "monaco", "date_start": "2026-06-05", "date_end": "2026-06-07", "race_date": "2026-06-07T13:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 9, "name": "Spanish Grand Prix", "city": "Barcelona", "country": "Spain", "circuit_key": "barcelona", "date_start": "2026-06-12", "date_end": "2026-06-14", "race_date": "2026-06-14T13:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 10, "name": "Austrian Grand Prix", "city": "Spielberg", "country": "Austria", "circuit_key": "spielberg", "date_start": "2026-06-26", "date_end": "2026-06-28", "race_date": "2026-06-28T13:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 11, "name": "British Grand Prix", "city": "Silverstone", "country": "UK", "circuit_key": "silverstone", "date_start": "2026-07-03", "date_end": "2026-07-05", "race_date": "2026-07-05T14:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 12, "name": "Belgian Grand Prix", "city": "Spa", "country": "Belgium", "circuit_key": "spa", "date_start": "2026-07-17", "date_end": "2026-07-19", "race_date": "2026-07-19T13:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 13, "name": "Hungarian Grand Prix", "city": "Budapest", "country": "Hungary", "circuit_key": "budapest", "date_start": "2026-07-24", "date_end": "2026-07-26", "race_date": "2026-07-26T13:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 14, "name": "Dutch Grand Prix", "city": "Zandvoort", "country": "Netherlands", "circuit_key": "zandvoort", "date_start": "2026-08-21", "date_end": "2026-08-23", "race_date": "2026-08-23T13:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 15, "name": "Italian Grand Prix", "city": "Monza", "country": "Italy", "circuit_key": "monza", "date_start": "2026-09-04", "date_end": "2026-09-06", "race_date": "2026-09-06T13:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 16, "name": "Madrid Grand Prix", "city": "Madrid", "country": "Spain", "circuit_key": "madrid", "date_start": "2026-09-11", "date_end": "2026-09-13", "race_date": "2026-09-13T13:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 17, "name": "Azerbaijan Grand Prix", "city": "Baku", "country": "Azerbaijan", "circuit_key": "baku", "date_start": "2026-09-24", "date_end": "2026-09-26", "race_date": "2026-09-26T11:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 18, "name": "Singapore Grand Prix", "city": "Singapore", "country": "Singapore", "circuit_key": "singapore", "date_start": "2026-10-09", "date_end": "2026-10-11", "race_date": "2026-10-11T12:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 19, "name": "United States Grand Prix", "city": "Austin", "country": "USA", "circuit_key": "austin", "date_start": "2026-10-23", "date_end": "2026-10-25", "race_date": "2026-10-25T19:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 20, "name": "Mexico City Grand Prix", "city": "Mexico City", "country": "Mexico", "circuit_key": "mexico_city", "date_start": "2026-10-30", "date_end": "2026-11-01", "race_date": "2026-11-01T20:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 21, "name": "Sao Paulo Grand Prix", "city": "Sao Paulo", "country": "Brazil", "circuit_key": "sao_paulo", "date_start": "2026-11-06", "date_end": "2026-11-08", "race_date": "2026-11-08T17:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 22, "name": "Las Vegas Grand Prix", "city": "Las Vegas", "country": "USA", "circuit_key": "las_vegas", "date_start": "2026-11-19", "date_end": "2026-11-21", "race_date": "2026-11-22T06:00:00Z", "is_sprint": False, "cancelled": False},
    {"round": 23, "name": "Qatar Grand Prix", "city": "Lusail", "country": "Qatar", "circuit_key": "lusail", "date_start": "2026-11-27", "date_end": "2026-11-29", "race_date": "2026-11-29T14:00:00Z", "is_sprint": True, "cancelled": False},
    {"round": 24, "name": "Abu Dhabi Grand Prix", "city": "Abu Dhabi", "country": "UAE", "circuit_key": "abu_dhabi", "date_start": "2026-12-04", "date_end": "2026-12-06", "race_date": "2026-12-06T13:00:00Z", "is_sprint": False, "cancelled": False},
]

SESSION_ORDER = ["FP1", "FP2", "FP3", "QUAL", "RACE"]
SPRINT_SESSION_ORDER = ["FP1", "SQ", "SPRINT", "QUAL", "RACE"]


class ScheduleFacade:
    def __init__(
        self,
        jolpica: JolpicaClient,
        openf1: OpenF1Client,
        cache: TTLCache,
    ) -> None:
        self._jolpica = jolpica
        self._openf1 = openf1
        self._cache = cache

    async def get_schedule(self, season: int = CURRENT_SEASON) -> dict:
        cache_key = f"schedule_{season}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []
        races = []

        try:
            raw_races = await self._jolpica.get_schedule(season)
        except Exception as e:
            logger.warning(f"Jolpica schedule failed: {e}")
            warnings.append("Schedule from fallback data")
            raw_races = None

        if not raw_races and season != CURRENT_SEASON:
            return {"season": season, "total_races": 0, "races": [], "warnings": ["Schedule unavailable for this season"]}

        if raw_races:
            for r in raw_races:
                circuit = get_circuit_by_name(
                    r.get("Circuit", {}).get("Location", {}).get("locality", "")
                )
                now = datetime.now(timezone.utc)
                race_dt_str = f"{r['date']}T{r.get('time', '00:00:00Z')}"
                try:
                    race_dt = datetime.fromisoformat(race_dt_str.replace("Z", "+00:00"))
                    is_completed = (race_dt + timedelta(hours=3)) < now
                except (ValueError, TypeError):
                    is_completed = False

                # Extract session start times
                is_sprint = "Sprint" in r or "SprintQualifying" in r
                session_list = []
                if is_sprint:
                    for key, label in [
                        ("FirstPractice", "FP1"),
                        ("SprintQualifying", "Sprint Qualifying"),
                        ("Sprint", "Sprint"),
                        ("Qualifying", "Qualifying"),
                    ]:
                        s = r.get(key, {})
                        if s.get("date") and s.get("time"):
                            session_list.append({
                                "name": label,
                                "start_utc": f"{s['date']}T{s['time']}",
                            })
                else:
                    for key, label in [
                        ("FirstPractice", "FP1"),
                        ("SecondPractice", "FP2"),
                        ("ThirdPractice", "FP3"),
                        ("Qualifying", "Qualifying"),
                    ]:
                        s = r.get(key, {})
                        if s.get("date") and s.get("time"):
                            session_list.append({
                                "name": label,
                                "start_utc": f"{s['date']}T{s['time']}",
                            })
                session_list.append({"name": "Race", "start_utc": race_dt_str})

                races.append({
                    "round": int(r["round"]),
                    "name": r["raceName"],
                    "country": r.get("Circuit", {}).get("Location", {}).get("country", ""),
                    "city": r.get("Circuit", {}).get("Location", {}).get("locality", ""),
                    "circuit": r.get("Circuit", {}).get("circuitName", ""),
                    "flag_emoji": circuit.flag_emoji if circuit else "",
                    "date_start": r.get("FirstPractice", {}).get("date", r["date"]),
                    "date_end": r["date"],
                    "race_date": race_dt_str,
                    "is_sprint_weekend": is_sprint,
                    "is_completed": is_completed,
                    "is_cancelled": False,
                    "latitude": circuit.latitude if circuit else 0.0,
                    "longitude": circuit.longitude if circuit else 0.0,
                    "timezone": circuit.timezone if circuit else "UTC",
                    "sessions": session_list,
                    "result": None,
                    "_raw_jolpica": r,
                })
        else:
            for fb in FALLBACK_SCHEDULE:
                circuit = CIRCUITS.get(fb["circuit_key"])
                now = datetime.now(timezone.utc)
                try:
                    race_dt = datetime.fromisoformat(fb["race_date"].replace("Z", "+00:00"))
                    is_completed = (race_dt + timedelta(hours=3)) < now and not fb["cancelled"]
                except (ValueError, TypeError):
                    is_completed = False

                races.append({
                    "round": fb["round"],
                    "name": fb["name"],
                    "country": circuit.country if circuit else "",
                    "city": fb["city"],
                    "circuit": circuit.name if circuit else "",
                    "flag_emoji": circuit.flag_emoji if circuit else "",
                    "date_start": fb["date_start"],
                    "date_end": fb["date_end"],
                    "race_date": fb["race_date"],
                    "is_sprint_weekend": fb["is_sprint"],
                    "is_completed": is_completed,
                    "is_cancelled": fb["cancelled"],
                    "latitude": circuit.latitude if circuit else 0.0,
                    "longitude": circuit.longitude if circuit else 0.0,
                    "timezone": circuit.timezone if circuit else "UTC",
                    "result": None,
                })

        # Strip internal fields before returning
        clean_races = [{k: v for k, v in r.items() if not k.startswith("_")} for r in races]
        result = {
            "season": season,
            "total_races": len([r for r in races if not r.get("is_cancelled")]),
            "races": clean_races,
            "warnings": warnings,
        }
        # Cache with raw data for internal use (get_next_session) — only for current season
        if season == CURRENT_SEASON:
            self._cache.set("schedule_internal", {"races": races}, settings.cache_ttl_schedule)
        self._cache.set(cache_key, result, settings.cache_ttl_schedule)
        return result

    async def get_next_session(self) -> dict:
        cached = self._cache.get("next_session")
        if cached:
            return cached

        warnings = []
        now = datetime.now(timezone.utc)

        await self.get_schedule(CURRENT_SEASON)  # ensure caches are populated
        internal = self._cache.get("schedule_internal")
        races_raw = internal["races"] if internal else []
        races = [r for r in races_raw if not r.get("is_cancelled")]

        # Find the next upcoming race
        next_race = None
        for race in races:
            try:
                race_dt = datetime.fromisoformat(race["race_date"].replace("Z", "+00:00"))
                if (race_dt + timedelta(hours=3)) > now:
                    next_race = race
                    break
            except (ValueError, TypeError):
                continue

        if not next_race:
            next_race = races[-1] if races else None

        if not next_race:
            return {"race": {}, "session": {}, "weekend_sessions": [], "warnings": ["No upcoming races found"]}

        # Build weekend sessions from Jolpica schedule data
        weekend_sessions = []
        raw_race = next_race.get("_raw_jolpica")

        # Session definitions with estimated durations (minutes)
        session_defs = []
        if raw_race:
            for key, name, short in [
                ("FirstPractice", "Practice 1", "FP1"),
                ("SecondPractice", "Practice 2", "FP2"),
                ("ThirdPractice", "Practice 3", "FP3"),
                ("SprintQualifying", "Sprint Qualifying", "SQ"),
                ("Sprint", "Sprint", "SPRINT"),
                ("Qualifying", "Qualifying", "QUAL"),
            ]:
                if key in raw_race:
                    s = raw_race[key]
                    start_str = f"{s['date']}T{s.get('time', '00:00:00Z')}"
                    session_defs.append((name, short, start_str))
            # Add the race itself
            race_start = f"{raw_race['date']}T{raw_race.get('time', '00:00:00Z')}"
            session_defs.append(("Race", "RACE", race_start))
        else:
            # Fallback: just show the race
            session_defs.append(("Race", "RACE", next_race["race_date"]))

        # Session durations for estimating end times (minutes)
        duration_map = {"FP1": 60, "FP2": 60, "FP3": 60, "SQ": 60, "SPRINT": 60, "QUAL": 60, "RACE": 180}

        next_session = None
        for name, short, start_str in session_defs:
            try:
                start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue

            duration = duration_map.get(short, 60)
            end_dt = start_dt + timedelta(minutes=duration)

            if start_dt <= now <= end_dt:
                status = "live"
            elif end_dt < now:
                status = "completed"
            else:
                status = "upcoming"

            end_str = end_dt.isoformat().replace("+00:00", "Z")

            ws = {
                "name": name,
                "short_name": short,
                "start_utc": start_str,
                "end_utc": end_str,
                "status": status,
            }
            weekend_sessions.append(ws)

            if status in ("upcoming", "live") and next_session is None:
                next_session = {
                    "name": name,
                    "short_name": short,
                    "start_utc": start_str,
                    "end_utc": end_str,
                    "is_live": status == "live",
                }

        if not next_session:
            # All sessions completed, show the last one
            last = weekend_sessions[-1] if weekend_sessions else None
            if last:
                next_session = {
                    "name": last["name"],
                    "short_name": last["short_name"],
                    "start_utc": last["start_utc"],
                    "end_utc": last["end_utc"],
                    "is_live": False,
                }
            else:
                next_session = {
                    "name": "Race",
                    "short_name": "RACE",
                    "start_utc": next_race["race_date"],
                    "end_utc": None,
                    "is_live": False,
                }

        # Match downloaded sessions by session_name to add session_keys
        try:
            downloaded = get_downloaded_sessions()
            dl_by_name = {s["session_name"]: s["session_key"] for s in downloaded
                          if s.get("circuit", "").lower() in next_race.get("circuit", "").lower()
                          or next_race.get("circuit", "").lower() in s.get("circuit", "").lower()}
            for ws in weekend_sessions:
                sk = dl_by_name.get(ws["name"])
                if sk:
                    ws["session_key"] = sk
        except Exception:
            pass

        result = {
            "race": {
                "round": next_race["round"],
                "name": next_race["name"],
                "country": next_race["country"],
                "city": next_race["city"],
                "circuit": next_race["circuit"],
                "flag_emoji": next_race["flag_emoji"],
                "timezone": next_race["timezone"],
                "is_sprint_weekend": next_race["is_sprint_weekend"],
            },
            "session": next_session,
            "weekend_sessions": weekend_sessions,
            "warnings": warnings,
        }
        self._cache.set("next_session", result, settings.cache_ttl_next_session)
        return result
