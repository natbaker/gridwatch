"""Behavioral tests for OpenF1Client._get using httpx.MockTransport."""

import pytest
import httpx
from unittest.mock import patch, AsyncMock

from app.services.clients.openf1 import OpenF1Client
from app.response_cache import ResponseCache, PERMANENT_TTL, DEFAULT_TTL


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client_with_transport(handler, cache=None):
    """Build an OpenF1Client backed by a MockTransport."""
    transport = httpx.MockTransport(handler)
    http = httpx.AsyncClient(transport=transport, base_url="http://test")
    return OpenF1Client(http_client=http, cache=cache)


def _make_response_cache():
    """In-memory ResponseCache (no filesystem)."""
    return ResponseCache(db_path=":memory:")


# ---------------------------------------------------------------------------
# Tests: caching behaviour
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_returns_cached_value_on_second_call_without_http():
    """Second call with the same params returns the cached value, not a new HTTP request."""
    call_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json=[{"session_key": 42}])

    cache = _make_response_cache()
    client = _make_client_with_transport(handler, cache=cache)

    result1 = await client._get("/sessions", params={"session_key": "42"})
    result2 = await client._get("/sessions", params={"session_key": "42"})

    assert result1 == result2
    # HTTP should have been called exactly once; second call served from cache
    assert call_count == 1


@pytest.mark.asyncio
async def test_retries_on_429():
    """A 429 response triggers a retry; the client should eventually succeed."""
    responses = iter([
        httpx.Response(429),
        httpx.Response(200, json=[{"session_key": 1}]),
    ])

    async def handler(request: httpx.Request) -> httpx.Response:
        return next(responses)

    client = _make_client_with_transport(handler)

    # Patch asyncio.sleep to avoid real delays in tests
    with patch("app.services.clients.openf1.asyncio.sleep", new_callable=AsyncMock):
        result = await client._get("/sessions")

    assert result == [{"session_key": 1}]


@pytest.mark.asyncio
async def test_returns_empty_list_on_404():
    """A 404 response should return an empty list immediately."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = _make_client_with_transport(handler)
    result = await client._get("/sessions", params={"session_key": "99"})

    assert result == []


@pytest.mark.asyncio
async def test_returns_empty_list_on_401():
    """A 401 response (API locked during live session) should return an empty list."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    client = _make_client_with_transport(handler)
    result = await client._get("/sessions", params={"session_key": "99"})

    assert result == []


@pytest.mark.asyncio
async def test_caches_with_permanent_ttl_when_session_key_in_params():
    """Requests scoped to a session_key should be cached with PERMANENT_TTL (0)."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"lap_number": 1}])

    cache = _make_response_cache()
    client = _make_client_with_transport(handler, cache=cache)

    await client._get("/laps", params={"session_key": "9999"})

    # Check what TTL was stored in the SQLite cache
    row = cache._conn.execute(
        "SELECT ttl FROM responses WHERE cache_key = ?",
        ("/laps?session_key=9999",),
    ).fetchone()
    assert row is not None
    assert row[0] == PERMANENT_TTL


@pytest.mark.asyncio
async def test_caches_with_default_ttl_when_no_special_params():
    """Requests with no special params are cached with DEFAULT_TTL (300 s)."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"session_key": 9510}])

    cache = _make_response_cache()
    client = _make_client_with_transport(handler, cache=cache)

    await client._get("/sessions")

    row = cache._conn.execute(
        "SELECT ttl FROM responses WHERE cache_key = ?",
        ("/sessions",),
    ).fetchone()
    assert row is not None
    assert row[0] == DEFAULT_TTL


@pytest.mark.asyncio
async def test_no_cache_hit_on_different_params():
    """Requests with different params produce separate cache entries."""
    call_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json=[{"session_key": call_count}])

    cache = _make_response_cache()
    client = _make_client_with_transport(handler, cache=cache)

    r1 = await client._get("/sessions", params={"session_key": "1"})
    r2 = await client._get("/sessions", params={"session_key": "2"})

    assert r1 != r2
    assert call_count == 2


@pytest.mark.asyncio
async def test_dict_response_returns_empty_list():
    """If the API returns a JSON dict (not list), _get returns []."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": "not a list"})

    client = _make_client_with_transport(handler)
    result = await client._get("/sessions")

    assert result == []


@pytest.mark.asyncio
async def test_all_429_exhausted_returns_empty_list():
    """If every attempt returns 429, returns empty list after exhausting retries."""
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429)

    client = _make_client_with_transport(handler)

    with patch("app.services.clients.openf1.asyncio.sleep", new_callable=AsyncMock):
        result = await client._get("/sessions")

    assert result == []
