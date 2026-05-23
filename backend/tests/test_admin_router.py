"""Tests for admin router authentication."""

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
async def test_status_requires_auth_token(client, monkeypatch):
    """GET /api/admin/status without a token returns 401 or 503."""
    monkeypatch.setattr("app.routers.admin.settings.admin_token", "secret123")
    resp = await client.get("/api/admin/status")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_status_valid_token_returns_200(client, monkeypatch):
    """GET /api/admin/status with the correct bearer token returns 200."""
    monkeypatch.setattr("app.routers.admin.settings.admin_token", "secret123")
    resp = await client.get(
        "/api/admin/status",
        headers={"Authorization": "Bearer secret123"},
    )
    assert resp.status_code == 200
    assert resp.json().get("ok") is True


@pytest.mark.asyncio
async def test_status_wrong_token_returns_401(client, monkeypatch):
    """GET /api/admin/status with the wrong token returns 401."""
    monkeypatch.setattr("app.routers.admin.settings.admin_token", "secret123")
    resp = await client.get(
        "/api/admin/status",
        headers={"Authorization": "Bearer wrongtoken"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_status_not_configured_returns_503(client, monkeypatch):
    """GET /api/admin/status returns 503 when admin_token is not configured."""
    monkeypatch.setattr("app.routers.admin.settings.admin_token", "")
    resp = await client.get(
        "/api/admin/status",
        headers={"Authorization": "Bearer anything"},
    )
    assert resp.status_code == 503
