import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from app.main import app, lifespan


@pytest_asyncio.fixture
async def client():
    async with lifespan(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest.mark.asyncio
async def test_driver_standings_returns_200(client):
    resp = await client.get("/api/standings/drivers")
    assert resp.status_code == 200
    data = resp.json()
    assert "standings" in data


@pytest.mark.asyncio
async def test_constructor_standings_returns_200(client):
    resp = await client.get("/api/standings/constructors")
    assert resp.status_code == 200
    data = resp.json()
    assert "standings" in data
