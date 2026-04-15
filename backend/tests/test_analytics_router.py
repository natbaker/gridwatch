import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app, lifespan


@pytest_asyncio.fixture
async def client():
    async with lifespan(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c


@pytest.mark.asyncio
async def test_progression_returns_200(client):
    resp = await client.get("/api/analytics/progression?season=2024")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_predictions_returns_200(client):
    resp = await client.get("/api/analytics/predictions?season=2024")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_driver_stats_returns_200(client):
    resp = await client.get("/api/analytics/driver/VER?season=2024")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
