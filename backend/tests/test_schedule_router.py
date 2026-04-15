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
async def test_schedule_returns_200(client):
    resp = await client.get("/api/schedule")
    assert resp.status_code == 200
    data = resp.json()
    assert "season" in data
    assert "races" in data
    assert isinstance(data["races"], list)


@pytest.mark.asyncio
async def test_next_session_returns_200(client):
    resp = await client.get("/api/next-session")
    assert resp.status_code == 200
    data = resp.json()
    assert "race" in data
    assert "session" in data
