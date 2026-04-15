import logging

import httpx

logger = logging.getLogger(__name__)

WMO_CODES = {
    0: ("Clear sky", "☀️"),
    1: ("Mainly clear", "🌤️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Fog", "🌫️"),
    48: ("Rime fog", "🌫️"),
    51: ("Light drizzle", "🌦️"),
    53: ("Moderate drizzle", "🌦️"),
    55: ("Dense drizzle", "🌧️"),
    61: ("Slight rain", "🌧️"),
    63: ("Moderate rain", "🌧️"),
    65: ("Heavy rain", "🌧️"),
    71: ("Slight snow", "🌨️"),
    73: ("Moderate snow", "🌨️"),
    75: ("Heavy snow", "❄️"),
    80: ("Slight showers", "🌦️"),
    81: ("Moderate showers", "🌧️"),
    82: ("Violent showers", "⛈️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm with hail", "⛈️"),
    99: ("Thunderstorm with heavy hail", "⛈️"),
}

WIND_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _degrees_to_direction(degrees: float) -> str:
    idx = round(degrees / 45) % 8
    return WIND_DIRECTIONS[idx]


class OpenMeteoClient:
    def __init__(self, http_client: httpx.AsyncClient) -> None:
        self._http = http_client

    async def get_forecast(
        self, lat: float, lon: float, start_date: str, end_date: str
    ) -> list[dict]:
        resp = await self._http.get(
            "/v1/forecast",
            params={
                "latitude": str(lat),
                "longitude": str(lon),
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max,winddirection_10m_dominant",
                "start_date": start_date,
                "end_date": end_date,
                "timezone": "UTC",
            },
        )
        resp.raise_for_status()
        data = resp.json()["daily"]
        days = []
        for i, date in enumerate(data["time"]):
            code = data["weathercode"][i]
            condition, icon = WMO_CODES.get(code, ("Unknown", "❓"))
            days.append({
                "date": date,
                "temp_high_c": round(data["temperature_2m_max"][i]),
                "temp_low_c": round(data["temperature_2m_min"][i]),
                "precipitation_probability": data["precipitation_probability_max"][i],
                "condition": condition,
                "condition_icon": icon,
                "wind_speed_kph": round(data["windspeed_10m_max"][i]),
                "wind_direction": _degrees_to_direction(data["winddirection_10m_dominant"][i]),
            })
        return days
