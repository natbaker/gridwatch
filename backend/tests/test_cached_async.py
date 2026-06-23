"""Tests for the cached_async facade-method decorator."""

import pytest

from app.cache import TTLCache, cached_async


class _Facade:
    def __init__(self) -> None:
        self._cache = TTLCache()
        self.calls = 0

    @cached_async(ttl=60, key=lambda season=2026: f"thing_{season}")
    async def get_thing(self, season: int = 2026) -> dict:
        self.calls += 1
        return {"season": season, "value": self.calls, "warnings": []}

    @cached_async(
        ttl=60,
        key=lambda: "boom",
        stale_warning="Using cached data",
        default={"value": None, "warnings": ["Unavailable"]},
    )
    async def get_flaky(self) -> dict:
        self.calls += 1
        raise RuntimeError("upstream down")

    @cached_async(
        ttl=60,
        key=lambda: "stale_key",
        stale_warning="Using cached data",
    )
    async def get_maybe_stale(self) -> dict:
        self.calls += 1
        if self.calls > 1:
            raise RuntimeError("upstream down")
        return {"value": "fresh", "warnings": []}


@pytest.mark.asyncio
async def test_caches_result_and_skips_second_call():
    f = _Facade()
    first = await f.get_thing(2026)
    second = await f.get_thing(2026)
    assert first == second
    assert f.calls == 1  # underlying fn invoked only once


@pytest.mark.asyncio
async def test_distinct_keys_invoke_separately():
    f = _Facade()
    await f.get_thing(2025)
    await f.get_thing(2026)
    assert f.calls == 2


@pytest.mark.asyncio
async def test_returns_default_on_error_when_no_stale():
    f = _Facade()
    result = await f.get_flaky()
    assert result == {"value": None, "warnings": ["Unavailable"]}


@pytest.mark.asyncio
async def test_returns_stale_with_warning_on_error():
    f = _Facade()
    fresh = await f.get_maybe_stale()
    assert fresh["value"] == "fresh"
    stale = await f.get_maybe_stale()  # cache expired path simulated via error
    # first call cached fresh; force expiry by invalidating live entry but keeping stale
    f._cache._store["stale_key"] = (f._cache._store["stale_key"][0], 0.0)
    stale = await f.get_maybe_stale()
    assert stale["warnings"] == ["Using cached data"]
    assert stale["value"] == "fresh"


@pytest.mark.asyncio
async def test_reraises_when_no_stale_and_no_default():
    class Bare:
        def __init__(self):
            self._cache = TTLCache()

        @cached_async(ttl=60, key=lambda: "k")
        async def go(self):
            raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        await Bare().go()
