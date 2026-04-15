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
async def test_live_timing_returns_200(client):
    resp = await client.get("/api/live-timing")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_live_session_returns_200(client):
    resp = await client.get("/api/live-timing/session")
    assert resp.status_code == 200
    data = resp.json()
    assert "session_key" in data
    assert "is_live" in data
