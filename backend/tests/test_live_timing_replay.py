"""Tests for LiveTimingFacade.get_replay_info — live detection and event processing."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock

from app.cache import TTLCache
from app.services.facades.live_timing import LiveTimingFacade


# ── Fixtures ──────────────────────────────────────────────────────────────────

_MINIMAL_BOUNDS = {
    "track_path": "M10,10 L20,20 Z",
    "sector_indices": [10, 20],
    "corners": [],
    "min_x": 0, "max_x": 100,
    "min_y": 0, "max_y": 100,
    "scale": 1.0, "offset_x": 20.0, "offset_y": 20.0,
    "rot_cx": 50.0, "rot_cy": 50.0,
    "rot_cos": 1.0, "rot_sin": 0.0,
}


def _make_facade(sessions=None):
    """Build a facade with _get_track_bounds and _get_driver_info mocked."""
    openf1 = AsyncMock()
    openf1.get_sessions.return_value = sessions or []
    openf1.get_positions.return_value = []
    openf1.get_intervals.return_value = []
    openf1.get_race_control.return_value = []
    openf1.get_laps.return_value = []
    openf1.get_weather.return_value = []
    openf1.get_pit_stops.return_value = []
    openf1.get_team_radio.return_value = []

    facade = LiveTimingFacade(openf1=openf1, cache=TTLCache())
    facade._get_track_bounds = AsyncMock(return_value=_MINIMAL_BOUNDS)
    facade._get_driver_info = AsyncMock(return_value={})
    return facade


def _empty_mongo(*_args, **_kwargs):
    """Async mock returning [] for any mongo_direct.query_session call."""
    return []


def _make_session_doc(start: str, end: str) -> dict:
    return {
        "session_key": 9999,
        "session_name": "Race",
        "circuit_short_name": "Monza",
        "date_start": start,
        "date_end": end,
    }


# ── is_live detection ────────────────────────────────────────────────���────────

@pytest.mark.asyncio
async def test_is_live_within_window():
    """`is_live=True` when now is between date_start and date_end."""
    now = datetime(2026, 5, 25, 14, 30, 0, tzinfo=timezone.utc)
    start = (now - timedelta(hours=1)).isoformat()
    end = (now + timedelta(hours=1)).isoformat()
    facade = _make_facade(sessions=[_make_session_doc(start, end)])

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = now
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(return_value=[])):
            result = await facade.get_replay_info(9999)

    assert result.get("is_live") is True


@pytest.mark.asyncio
async def test_is_live_false_historical():
    """`is_live=False` when session ended in the past."""
    now = datetime(2026, 5, 25, 14, 30, 0, tzinfo=timezone.utc)
    start = "2025-03-01T12:00:00+00:00"
    end = "2025-03-01T14:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(start, end)])

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = now
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(return_value=[])):
            result = await facade.get_replay_info(9999)

    assert result.get("is_live") is False


@pytest.mark.asyncio
async def test_is_live_false_future():
    """`is_live=False` when session hasn't started yet."""
    now = datetime(2026, 5, 25, 14, 30, 0, tzinfo=timezone.utc)
    start = (now + timedelta(hours=2)).isoformat()
    end = (now + timedelta(hours=4)).isoformat()
    facade = _make_facade(sessions=[_make_session_doc(start, end)])

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = now
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(return_value=[])):
            result = await facade.get_replay_info(9999)

    assert result.get("is_live") is False


@pytest.mark.asyncio
async def test_missing_data_start_returns_error():
    """Returns error dict when session has no date_start."""
    facade = _make_facade(sessions=[{"session_key": 9999}])

    with patch("app.services.mongo_direct.query_session", new=AsyncMock(return_value=[])):
        result = await facade.get_replay_info(9999)

    assert "error" in result


@pytest.mark.asyncio
async def test_no_bounds_returns_error():
    """Returns error dict when _get_track_bounds returns None."""
    facade = _make_facade()
    facade._get_track_bounds = AsyncMock(return_value=None)

    result = await facade.get_replay_info(9999)

    assert "error" in result


# ── Lap events ────────────────────────────────────────────────────────────────

def _laps(entries: list[tuple[int, float, str]]) -> list[dict]:
    """Build lap dicts: (lap_number, offset_seconds, date_start_str) from session start."""
    session_start = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    result = []
    for lap_num, offset, _ in entries:
        result.append({
            "session_key": 9999,
            "lap_number": lap_num,
            "driver_number": 1,
            "date_start": (session_start + timedelta(seconds=offset)).isoformat(),
        })
    return result


@pytest.mark.asyncio
async def test_lap_events_deduplicated():
    """Duplicate lap_number values across multiple drivers produce only one lap event."""
    session_start = "2026-05-25T13:00:00+00:00"
    session_end = "2026-05-25T15:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(session_start, session_end)])

    start_dt = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    raw_laps = [
        {"session_key": 9999, "lap_number": 1, "driver_number": 1,
         "date_start": (start_dt + timedelta(seconds=100)).isoformat()},
        {"session_key": 9999, "lap_number": 1, "driver_number": 44,  # same lap, different driver
         "date_start": (start_dt + timedelta(seconds=102)).isoformat()},
        {"session_key": 9999, "lap_number": 2, "driver_number": 1,
         "date_start": (start_dt + timedelta(seconds=200)).isoformat()},
    ]

    async def mongo_side_effect(collection, session_key):
        if collection == "laps":
            return raw_laps
        return []

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 5, 25, 16, 0, 0, tzinfo=timezone.utc)
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(side_effect=mongo_side_effect)):
            result = await facade.get_replay_info(9999)

    lap_nums = [e["lap"] for e in result["lap_events"]]
    # Both lap 1 entries should deduplicate to a single lap 1 event
    assert lap_nums.count(1) == 1
    assert 2 in lap_nums


@pytest.mark.asyncio
async def test_lap_events_sorted_by_t():
    """Lap events are returned in ascending time offset order."""
    session_start = "2026-05-25T13:00:00+00:00"
    session_end = "2026-05-25T15:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(session_start, session_end)])

    start_dt = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    # Provide laps intentionally out of order
    raw_laps = [
        {"session_key": 9999, "lap_number": 3, "driver_number": 1,
         "date_start": (start_dt + timedelta(seconds=300)).isoformat()},
        {"session_key": 9999, "lap_number": 1, "driver_number": 1,
         "date_start": (start_dt + timedelta(seconds=100)).isoformat()},
        {"session_key": 9999, "lap_number": 2, "driver_number": 1,
         "date_start": (start_dt + timedelta(seconds=200)).isoformat()},
    ]

    async def mongo_side_effect(collection, session_key):
        if collection == "laps":
            return raw_laps
        return []

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 5, 25, 16, 0, 0, tzinfo=timezone.utc)
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(side_effect=mongo_side_effect)):
            result = await facade.get_replay_info(9999)

    ts = [e["t"] for e in result["lap_events"]]
    assert ts == sorted(ts)


# ── Interval downsampling ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_interval_downsampling_within_5s():
    """Two interval events for same driver within 5s → only the first is kept."""
    session_start = "2026-05-25T13:00:00+00:00"
    session_end = "2026-05-25T15:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(session_start, session_end)])

    start_dt = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    raw_intervals = [
        {"session_key": 9999, "driver_number": 44, "gap_to_leader": 2.0, "interval": 2.0,
         "date": (start_dt + timedelta(seconds=100)).isoformat()},
        {"session_key": 9999, "driver_number": 44, "gap_to_leader": 2.1, "interval": 2.1,
         "date": (start_dt + timedelta(seconds=103)).isoformat()},  # 3s later — should be dropped
    ]

    async def mongo_side_effect(collection, session_key):
        if collection == "intervals":
            return raw_intervals
        return []

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 5, 25, 16, 0, 0, tzinfo=timezone.utc)
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(side_effect=mongo_side_effect)):
            result = await facade.get_replay_info(9999)

    driver_44_ivs = [e for e in result["interval_events"] if e["n"] == 44]
    assert len(driver_44_ivs) == 1
    assert driver_44_ivs[0]["g"] == pytest.approx(2.0)


@pytest.mark.asyncio
async def test_interval_events_beyond_5s_both_kept():
    """Two interval events for same driver more than 5s apart — both kept."""
    session_start = "2026-05-25T13:00:00+00:00"
    session_end = "2026-05-25T15:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(session_start, session_end)])

    start_dt = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    raw_intervals = [
        {"session_key": 9999, "driver_number": 44, "gap_to_leader": 2.0, "interval": 2.0,
         "date": (start_dt + timedelta(seconds=100)).isoformat()},
        {"session_key": 9999, "driver_number": 44, "gap_to_leader": 2.5, "interval": 2.5,
         "date": (start_dt + timedelta(seconds=110)).isoformat()},  # 10s later — should be kept
    ]

    async def mongo_side_effect(collection, session_key):
        if collection == "intervals":
            return raw_intervals
        return []

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 5, 25, 16, 0, 0, tzinfo=timezone.utc)
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(side_effect=mongo_side_effect)):
            result = await facade.get_replay_info(9999)

    driver_44_ivs = [e for e in result["interval_events"] if e["n"] == 44]
    assert len(driver_44_ivs) == 2


# ── Pit events ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pit_events_consecutive_laps_grouped():
    """Pit entries on consecutive laps (N and N+1) are collapsed to one event."""
    session_start = "2026-05-25T13:00:00+00:00"
    session_end = "2026-05-25T15:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(session_start, session_end)])

    start_dt = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    raw_pits = [
        {"session_key": 9999, "driver_number": 44, "lap_number": 20, "pit_duration": 2.5,
         "date": (start_dt + timedelta(minutes=40)).isoformat()},
        {"session_key": 9999, "driver_number": 44, "lap_number": 21, "pit_duration": None,
         "date": (start_dt + timedelta(minutes=42)).isoformat()},
    ]

    async def mongo_side_effect(collection, session_key):
        if collection == "pit":
            return raw_pits
        return []

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 5, 25, 16, 0, 0, tzinfo=timezone.utc)
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(side_effect=mongo_side_effect)):
            result = await facade.get_replay_info(9999)

    driver_44_pits = [e for e in result["pit_events"] if e["n"] == 44]
    assert len(driver_44_pits) == 1
    assert driver_44_pits[0]["d"] == pytest.approx(2.5)


@pytest.mark.asyncio
async def test_pit_events_non_consecutive_laps_not_grouped():
    """Pit entries on non-consecutive laps (gap > 1) produce two separate events."""
    session_start = "2026-05-25T13:00:00+00:00"
    session_end = "2026-05-25T15:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(session_start, session_end)])

    start_dt = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    raw_pits = [
        {"session_key": 9999, "driver_number": 44, "lap_number": 20, "pit_duration": 2.5,
         "date": (start_dt + timedelta(minutes=40)).isoformat()},
        {"session_key": 9999, "driver_number": 44, "lap_number": 40, "pit_duration": 2.7,
         "date": (start_dt + timedelta(minutes=80)).isoformat()},
    ]

    async def mongo_side_effect(collection, session_key):
        if collection == "pit":
            return raw_pits
        return []

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 5, 25, 16, 0, 0, tzinfo=timezone.utc)
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(side_effect=mongo_side_effect)):
            result = await facade.get_replay_info(9999)

    driver_44_pits = [e for e in result["pit_events"] if e["n"] == 44]
    assert len(driver_44_pits) == 2


# ── Weather downsampling ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_weather_downsampled_when_large():
    """300 weather rows at 1-second intervals → downsampled to ~1 per 30s."""
    session_start = "2026-05-25T13:00:00+00:00"
    session_end = "2026-05-25T15:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(session_start, session_end)])

    start_dt = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    raw_weather = [
        {"session_key": 9999, "date": (start_dt + timedelta(seconds=i)).isoformat(),
         "air_temperature": 25.0, "track_temperature": 40.0,
         "humidity": 50.0, "wind_speed": 5.0, "wind_direction": 180, "rainfall": 0}
        for i in range(300)
    ]

    async def mongo_side_effect(collection, session_key):
        if collection == "weather":
            return raw_weather
        return []

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 5, 25, 16, 0, 0, tzinfo=timezone.utc)
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(side_effect=mongo_side_effect)):
            result = await facade.get_replay_info(9999)

    # 300 rows at 1s → after downsampling at 30s we get ceil(300/30) = 10 rows
    assert len(result["weather_events"]) <= 15  # well under 200


@pytest.mark.asyncio
async def test_weather_not_downsampled_when_small():
    """Fewer than 200 weather rows are returned as-is."""
    session_start = "2026-05-25T13:00:00+00:00"
    session_end = "2026-05-25T15:00:00+00:00"
    facade = _make_facade(sessions=[_make_session_doc(session_start, session_end)])

    start_dt = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    raw_weather = [
        {"session_key": 9999, "date": (start_dt + timedelta(seconds=i * 60)).isoformat(),
         "air_temperature": 25.0, "track_temperature": 40.0,
         "humidity": 50.0, "wind_speed": 5.0, "wind_direction": 180, "rainfall": 0}
        for i in range(10)
    ]

    async def mongo_side_effect(collection, session_key):
        if collection == "weather":
            return raw_weather
        return []

    with patch("app.services.facades.live_timing.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 5, 25, 16, 0, 0, tzinfo=timezone.utc)
        mock_dt.fromisoformat.side_effect = datetime.fromisoformat
        with patch("app.services.mongo_direct.query_session", new=AsyncMock(side_effect=mongo_side_effect)):
            result = await facade.get_replay_info(9999)

    assert len(result["weather_events"]) == 10
