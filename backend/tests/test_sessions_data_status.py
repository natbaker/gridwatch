"""Tests for LiveTimingFacade.get_sessions_data_status."""

import pytest
from unittest.mock import AsyncMock, call

from app.cache import TTLCache
from app.services.facades.live_timing import LiveTimingFacade


def _make_facade(meetings=None, sessions_by_meeting=None, laps=None, radio=None, has_locs=None):
    openf1 = AsyncMock()
    openf1.get_meetings.return_value = meetings or []

    # get_sessions returns different data depending on meeting_key kwarg
    sessions_map = sessions_by_meeting or {}

    async def get_sessions_side_effect(**kwargs):
        mk = kwargs.get("meeting_key")
        return sessions_map.get(str(mk), [])

    openf1.get_sessions.side_effect = get_sessions_side_effect
    openf1.get_laps.return_value = laps if laps is not None else []
    openf1.get_team_radio.return_value = radio if radio is not None else []
    openf1.check_has_locations.return_value = has_locs if has_locs is not None else False

    return LiveTimingFacade(openf1=openf1, cache=TTLCache()), openf1


def _meeting(key: int, name: str = "Australian Grand Prix") -> dict:
    return {
        "meeting_key": key,
        "meeting_name": name,
        "circuit_short_name": "Albert Park",
        "date_start": "2026-03-15",
    }


def _session(key: int, meeting_key: int, name: str = "Race") -> dict:
    return {
        "session_key": key,
        "meeting_key": meeting_key,
        "session_name": name,
        "date_start": "2026-03-16T05:00:00+00:00",
    }


# ── Filtering ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_filters_test_sessions():
    """Meetings with 'test' in the name are excluded from results."""
    meetings = [
        _meeting(1, "Australian Grand Prix"),
        _meeting(2, "Pre-Season Testing"),
        _meeting(3, "Bahrain Grand Prix"),
    ]
    sessions_map = {
        "1": [_session(101, 1)],
        "2": [_session(201, 2)],
        "3": [_session(301, 3)],
    }
    facade, _ = _make_facade(meetings=meetings, sessions_by_meeting=sessions_map)

    result = await facade.get_sessions_data_status(2026)

    names = [m["meeting_name"] for m in result]
    assert "Pre-Season Testing" not in names
    assert "Australian Grand Prix" in names
    assert "Bahrain Grand Prix" in names


# ── has_positions / has_laps / has_radio flags ────────────────────────────────

@pytest.mark.asyncio
async def test_has_positions_true_when_locations_exist():
    """has_positions=True when check_has_locations returns True."""
    meetings = [_meeting(1)]
    sessions_map = {"1": [_session(101, 1)]}
    facade, _ = _make_facade(meetings=meetings, sessions_by_meeting=sessions_map, has_locs=True)

    result = await facade.get_sessions_data_status(2026)

    session = result[0]["sessions"][0]
    assert session["has_positions"] is True


@pytest.mark.asyncio
async def test_has_positions_false_when_no_locations():
    """has_positions=False when check_has_locations returns False."""
    meetings = [_meeting(1)]
    sessions_map = {"1": [_session(101, 1)]}
    facade, _ = _make_facade(meetings=meetings, sessions_by_meeting=sessions_map, has_locs=False)

    result = await facade.get_sessions_data_status(2026)

    session = result[0]["sessions"][0]
    assert session["has_positions"] is False


@pytest.mark.asyncio
async def test_has_laps_true_when_laps_present():
    """has_laps=True when get_laps returns data."""
    meetings = [_meeting(1)]
    sessions_map = {"1": [_session(101, 1)]}
    facade, _ = _make_facade(
        meetings=meetings, sessions_by_meeting=sessions_map,
        laps=[{"lap_number": 1, "session_key": 101}],
    )

    result = await facade.get_sessions_data_status(2026)

    session = result[0]["sessions"][0]
    assert session["has_laps"] is True


@pytest.mark.asyncio
async def test_has_laps_false_when_no_laps():
    """has_laps=False when get_laps returns empty list."""
    meetings = [_meeting(1)]
    sessions_map = {"1": [_session(101, 1)]}
    facade, _ = _make_facade(meetings=meetings, sessions_by_meeting=sessions_map, laps=[])

    result = await facade.get_sessions_data_status(2026)

    session = result[0]["sessions"][0]
    assert session["has_laps"] is False


@pytest.mark.asyncio
async def test_has_radio_true_when_radio_present():
    """has_radio=True when get_team_radio returns data."""
    meetings = [_meeting(1)]
    sessions_map = {"1": [_session(101, 1)]}
    facade, _ = _make_facade(
        meetings=meetings, sessions_by_meeting=sessions_map,
        radio=[{"driver_number": 44, "recording_url": "https://example.com/audio.mp3"}],
    )

    result = await facade.get_sessions_data_status(2026)

    session = result[0]["sessions"][0]
    assert session["has_radio"] is True


# ── Caching ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_result_cached_second_call_skips_openf1():
    """Second call returns cached result; OpenF1 is not queried again."""
    meetings = [_meeting(1)]
    sessions_map = {"1": [_session(101, 1)]}
    facade, openf1 = _make_facade(meetings=meetings, sessions_by_meeting=sessions_map)

    await facade.get_sessions_data_status(2026)
    call_count_after_first = openf1.get_meetings.call_count

    await facade.get_sessions_data_status(2026)

    assert openf1.get_meetings.call_count == call_count_after_first  # no new calls


# ── Concurrency ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_all_sessions_complete_under_semaphore():
    """All sessions complete even when exceeding the semaphore limit of 3."""
    meetings = [_meeting(i) for i in range(1, 4)]  # 3 meetings
    sessions_per_meeting = 4  # 12 sessions total — more than semaphore=3
    sessions_map = {
        str(i): [_session(i * 10 + j, i, f"Session {j}") for j in range(sessions_per_meeting)]
        for i in range(1, 4)
    }
    facade, _ = _make_facade(meetings=meetings, sessions_by_meeting=sessions_map)

    result = await facade.get_sessions_data_status(2026)

    total_sessions = sum(len(m["sessions"]) for m in result)
    assert total_sessions == 3 * sessions_per_meeting  # all 12 sessions returned
