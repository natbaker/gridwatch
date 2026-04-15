import httpx
import pytest

from app.services.clients.openmeteo import OpenMeteoClient


@pytest.fixture
def mock_transport():
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "daily": {
                "time": ["2026-03-27", "2026-03-28", "2026-03-29"],
                "temperature_2m_max": [18.0, 17.0, 19.0],
                "temperature_2m_min": [11.0, 10.0, 12.0],
                "precipitation_probability_max": [20, 45, 10],
                "weathercode": [2, 61, 0],
                "windspeed_10m_max": [15.0, 20.0, 12.0],
                "winddirection_10m_dominant": [225, 270, 315],
            }
        })

    return httpx.MockTransport(handler)


@pytest.fixture
def client(mock_transport):
    http = httpx.AsyncClient(transport=mock_transport, base_url="http://test")
    return OpenMeteoClient(http)


@pytest.mark.asyncio
async def test_get_forecast(client):
    forecast = await client.get_forecast(34.8431, 136.5407, "2026-03-27", "2026-03-29")
    assert len(forecast) == 3
    assert forecast[0]["temp_high_c"] == 18
    assert forecast[1]["precipitation_probability"] == 45
