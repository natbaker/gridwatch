"""Behavioral tests for OpenF1Client._get using httpx.MockTransport."""

import pytest
import httpx
from unittest.mock import patch, AsyncMock

from app.services.clients.openf1 import OpenF1Client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client(handler, fallback_handler=None):
    """Build an OpenF1Client backed by MockTransport(s)."""
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://primary")
    fallback = None
    if fallback_handler is not None:
        fallback = httpx.AsyncClient(transport=httpx.MockTransport(fallback_handler), base_url="http://fallback")
    return OpenF1Client(http_client=http, fallback_client=fallback)


# ---------------------------------------------------------------------------
# Tests: retry behaviour
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_retries_on_429():
    """A 429 response triggers a retry; the client should eventually succeed."""
    responses = iter([
        httpx.Response(429),
        httpx.Response(200, json=[{"session_key": 1}]),
    ])

    async def handler(request: httpx.Request) -> httpx.Response:
        return next(responses)

    client = _make_client(handler)

    with patch("app.services.clients.openf1.asyncio.sleep", new_callable=AsyncMock):
        result = await client._get("/sessions")

    assert result == [{"session_key": 1}]


@pytest.mark.asyncio
async def test_returns_empty_list_on_404():
    """A 404 response should return an empty list immediately."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = _make_client(handler)
    result = await client._get("/sessions", params={"session_key": "99"})

    assert result == []


@pytest.mark.asyncio
async def test_returns_empty_list_on_401():
    """A 401 response (API locked during live session) should return an empty list."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    client = _make_client(handler)
    result = await client._get("/sessions", params={"session_key": "99"})

    assert result == []


@pytest.mark.asyncio
async def test_dict_response_returns_empty_list():
    """If the API returns a JSON dict (not list), _get returns []."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": "not a list"})

    client = _make_client(handler)
    result = await client._get("/sessions")

    assert result == []


@pytest.mark.asyncio
async def test_all_429_exhausted_returns_empty_list():
    """If every attempt returns 429, returns empty list after exhausting retries."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429)

    client = _make_client(handler)

    with patch("app.services.clients.openf1.asyncio.sleep", new_callable=AsyncMock):
        result = await client._get("/sessions")

    assert result == []


# ---------------------------------------------------------------------------
# Tests: fallback behaviour
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fallback_used_when_primary_returns_empty():
    """When primary returns [] and a fallback client is configured, fallback is tried."""
    async def primary(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    async def fallback(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"session_key": 7}])

    client = _make_client(primary, fallback_handler=fallback)
    result = await client._get("/sessions")

    assert result == [{"session_key": 7}]


@pytest.mark.asyncio
async def test_fallback_not_called_when_primary_returns_data():
    """When primary returns data, the fallback should not be called."""
    fallback_called = False

    async def primary(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"session_key": 3}])

    async def fallback(request: httpx.Request) -> httpx.Response:
        nonlocal fallback_called
        fallback_called = True
        return httpx.Response(200, json=[{"session_key": 99}])

    client = _make_client(primary, fallback_handler=fallback)
    result = await client._get("/sessions")

    assert result == [{"session_key": 3}]
    assert not fallback_called


@pytest.mark.asyncio
async def test_no_fallback_configured_returns_empty():
    """When primary returns [] and no fallback is configured, returns []."""
    async def primary(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    client = _make_client(primary)
    result = await client._get("/sessions")

    assert result == []
