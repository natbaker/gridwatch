"""Tests for the SSE live-timing stream generator."""

import json
from unittest.mock import AsyncMock

import pytest

from app.routers.live_timing import _timing_event_stream


@pytest.mark.asyncio
async def test_stream_yields_sse_timing_event():
    facade = AsyncMock()
    facade.get_timing_data = AsyncMock(return_value={"session": {"is_live": False}, "drivers": []})

    async def not_disconnected() -> bool:
        return False

    events = [
        chunk
        async for chunk in _timing_event_stream(
            facade, None, not_disconnected, sleep=AsyncMock(), max_events=1
        )
    ]

    assert len(events) == 1
    assert events[0].startswith("data: ")
    payload = json.loads(events[0][len("data: "):].strip())
    assert payload["session"]["is_live"] is False
    facade.get_timing_data.assert_awaited_once_with(None)


@pytest.mark.asyncio
async def test_stream_stops_immediately_on_disconnect():
    facade = AsyncMock()
    facade.get_timing_data = AsyncMock(return_value={"session": None})

    async def disconnected() -> bool:
        return True

    events = [
        chunk
        async for chunk in _timing_event_stream(facade, 5, disconnected, sleep=AsyncMock())
    ]

    assert events == []
    facade.get_timing_data.assert_not_awaited()


@pytest.mark.asyncio
async def test_stream_uses_short_interval_when_live():
    facade = AsyncMock()
    facade.get_timing_data = AsyncMock(return_value={"session": {"is_live": True}})
    sleep = AsyncMock()

    async def not_disconnected() -> bool:
        return False

    async for _ in _timing_event_stream(
        facade, 1, not_disconnected, sleep=sleep, max_events=2
    ):
        pass

    sleep.assert_awaited_once_with(5)
