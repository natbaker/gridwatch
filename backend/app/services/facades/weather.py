import logging
from datetime import datetime, timedelta, timezone

from app.cache import TTLCache
from app.circuits import CIRCUITS
from app.config import settings
from app.services.clients.openmeteo import OpenMeteoClient

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class WeatherFacade:
    def __init__(self, openmeteo: OpenMeteoClient, cache: TTLCache) -> None:
        self._openmeteo = openmeteo
        self._cache = cache

    async def get_weather(self, round_num: int, schedule: dict) -> dict:
        cache_key = f"weather_{round_num}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        warnings = []

        race = None
        for r in schedule.get("races", []):
            if r["round"] == round_num:
                race = r
                break

        if not race:
            return {"round": round_num, "location": "Unknown", "forecast": [], "warnings": ["Race not found"]}

        lat = race.get("latitude", 0.0)
        lon = race.get("longitude", 0.0)
        location = f"{race['city']}, {race['country']}"

        start_date = race.get("date_start", "")
        end_date = race.get("date_end", "")

        if not start_date or not end_date:
            return {"round": round_num, "location": location, "forecast": [], "warnings": ["No date info"]}

        try:
            raw_forecast = await self._openmeteo.get_forecast(lat, lon, start_date, end_date)
        except Exception as e:
            logger.warning(f"Weather forecast failed: {e}")
            return {"round": round_num, "location": location, "forecast": [], "warnings": ["Weather unavailable"]}

        forecast = []
        for day in raw_forecast:
            try:
                dt = datetime.strptime(day["date"], "%Y-%m-%d")
                day_label = WEEKDAY_NAMES[dt.weekday()]
            except (ValueError, IndexError):
                day_label = ""

            forecast.append({
                "date": day["date"],
                "day_label": day_label,
                "temp_high_c": day["temp_high_c"],
                "temp_low_c": day["temp_low_c"],
                "precipitation_probability": day["precipitation_probability"],
                "condition": day["condition"],
                "condition_icon": day["condition_icon"],
                "wind_speed_kph": day["wind_speed_kph"],
                "wind_direction": day["wind_direction"],
            })

        result = {
            "round": round_num,
            "location": location,
            "forecast": forecast,
            "warnings": warnings,
        }
        self._cache.set(cache_key, result, settings.cache_ttl_weather)
        return result
