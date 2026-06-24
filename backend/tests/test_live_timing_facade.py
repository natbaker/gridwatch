"""Behavioral tests for LiveTimingFacade — get_timing_data and session key lookup."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone, timedelta

from app.cache import TTLCache
from app.services.facades.live_timing import LiveTimingFacade


def _make_session(is_live: bool = False) -> dict:
    return {
        "session_key": 9999,
        "session_name": "Race",
        "session_type": "Race",
        "circuit": "Test",
        "country": "Testland",
        "date_start": "2026-05-07T14:00:00+00:00",
        "date_end": "2026-05-07T16:00:00+00:00",
        "is_live": is_live,
    }


def _make_openf1_mock(
    drivers=None,
    positions=None,
    intervals=None,
    laps=None,
    stints=None,
    pit_stops=None,
    sessions=None,
):
    mock = AsyncMock()
    mock.get_drivers.return_value = drivers or []
    mock.get_positions.return_value = positions or []
    mock.get_intervals.return_value = intervals or []
    mock.get_laps.return_value = laps or []
    mock.get_stints.return_value = stints or []
    mock.get_pit_stops.return_value = pit_stops or []
    mock.get_sessions.return_value = sessions or []
    return mock


@pytest.mark.asyncio
async def test_empty_data_returns_skeleton():
    """When both positions_raw and drivers_raw are empty, return the empty skeleton."""
    cache = TTLCache()
    openf1 = _make_openf1_mock()
    session_info = _make_session()
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    result = await facade.get_timing_data(session_key=9999)

    assert result["drivers"] == []
    assert result["pit_stops"] == []
    assert "warnings" in result
    assert isinstance(result["warnings"], list)
    # session may be None because get_sessions also returned []
    assert "session" in result


@pytest.mark.asyncio
async def test_drivers_sorted_by_position_ascending_zero_at_end():
    """Drivers are sorted by position ascending; position 0 (unknown) goes to the end."""
    cache = TTLCache()
    drivers = [
        {"driver_number": 1, "name_acronym": "VER", "full_name": "M Verstappen",
         "team_name": "Red Bull", "team_colour": "FF0000", "country_code": "NL"},
        {"driver_number": 44, "name_acronym": "HAM", "full_name": "L Hamilton",
         "team_name": "Ferrari", "team_colour": "FF2800", "country_code": "GB"},
        {"driver_number": 63, "name_acronym": "RUS", "full_name": "G Russell",
         "team_name": "Mercedes", "team_colour": "27F4D2", "country_code": "GB"},
    ]
    positions = [
        {"driver_number": 1, "position": 3},
        {"driver_number": 44, "position": 1},
        {"driver_number": 63, "position": 0},  # no recorded position
    ]
    openf1 = _make_openf1_mock(drivers=drivers, positions=positions)
    openf1.get_sessions.return_value = [
        {"session_key": 9999, "session_name": "Race", "session_type": "Race",
         "circuit_short_name": "Test", "country_name": "Testland",
         "date_start": "2026-01-01T12:00:00+00:00", "date_end": "2026-01-01T14:00:00+00:00"}
    ]
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    result = await facade.get_timing_data(session_key=9999)
    nums = [d["driver_number"] for d in result["drivers"]]

    # HAM (pos=1) first, VER (pos=3) second, RUS (pos=0) last
    assert nums.index(44) < nums.index(1)
    assert nums.index(63) == len(nums) - 1


@pytest.mark.asyncio
async def test_practice_session_sorted_by_fastest_lap():
    """For Practice/Qualifying, position data is unreliable — sort by best lap instead,
    with drivers who haven't set a time at the bottom."""
    cache = TTLCache()
    drivers = [
        {"driver_number": 1, "name_acronym": "VER", "full_name": "M Verstappen",
         "team_name": "Red Bull", "team_colour": "FF0000", "country_code": "NL"},
        {"driver_number": 44, "name_acronym": "HAM", "full_name": "L Hamilton",
         "team_name": "Ferrari", "team_colour": "FF2800", "country_code": "GB"},
        {"driver_number": 63, "name_acronym": "RUS", "full_name": "G Russell",
         "team_name": "Mercedes", "team_colour": "27F4D2", "country_code": "GB"},
    ]
    # All positions report 0 — typical for practice sessions
    positions = [
        {"driver_number": 1, "position": 0},
        {"driver_number": 44, "position": 0},
        {"driver_number": 63, "position": 0},
    ]
    laps = [
        {"driver_number": 1, "lap_number": 5, "lap_duration": 91.5,
         "is_pit_out_lap": False, "duration_sector_1": 30.0,
         "duration_sector_2": 30.0, "duration_sector_3": 31.5},
        {"driver_number": 44, "lap_number": 5, "lap_duration": 90.2,
         "is_pit_out_lap": False, "duration_sector_1": 30.0,
         "duration_sector_2": 30.0, "duration_sector_3": 30.2},
        # RUS has no completed lap yet
    ]
    openf1 = _make_openf1_mock(drivers=drivers, positions=positions, laps=laps)
    openf1.get_sessions.return_value = [
        {"session_key": 9999, "session_name": "Practice 1", "session_type": "Practice",
         "circuit_short_name": "Test", "country_name": "Testland",
         "date_start": "2026-01-01T12:00:00+00:00", "date_end": "2026-01-01T14:00:00+00:00"}
    ]
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    result = await facade.get_timing_data(session_key=9999)
    nums = [d["driver_number"] for d in result["drivers"]]

    # HAM (90.2s) fastest, VER (91.5s) second, RUS (no time) last
    assert nums == [44, 1, 63]

    # Positions are reassigned to match the fastest-lap ranking; drivers with
    # no time get position 0 (rendered as "—") rather than a stale OpenF1 rank.
    by_num = {d["driver_number"]: d for d in result["drivers"]}
    assert by_num[44]["position"] == 1
    assert by_num[1]["position"] == 2
    assert by_num[63]["position"] == 0


@pytest.mark.asyncio
async def test_is_session_best_for_fastest_driver():
    """is_session_best is True only for the driver with the shortest lap time."""
    cache = TTLCache()
    drivers = [
        {"driver_number": 1, "name_acronym": "VER", "full_name": "M Verstappen",
         "team_name": "Red Bull", "team_colour": "FF0000", "country_code": "NL"},
        {"driver_number": 44, "name_acronym": "HAM", "full_name": "L Hamilton",
         "team_name": "Ferrari", "team_colour": "FF2800", "country_code": "GB"},
    ]
    positions = [
        {"driver_number": 1, "position": 1},
        {"driver_number": 44, "position": 2},
    ]
    # VER has the faster lap (90 s vs HAM's 92 s)
    laps = [
        {"driver_number": 1, "lap_number": 5, "lap_duration": 90.0,
         "is_pit_out_lap": False, "duration_sector_1": 30.0,
         "duration_sector_2": 30.0, "duration_sector_3": 30.0},
        {"driver_number": 44, "lap_number": 5, "lap_duration": 92.0,
         "is_pit_out_lap": False, "duration_sector_1": 31.0,
         "duration_sector_2": 31.0, "duration_sector_3": 30.0},
    ]
    openf1 = _make_openf1_mock(drivers=drivers, positions=positions, laps=laps)
    openf1.get_sessions.return_value = [
        {"session_key": 9999, "session_name": "Race", "session_type": "Race",
         "circuit_short_name": "Test", "country_name": "Testland",
         "date_start": "2026-01-01T12:00:00+00:00", "date_end": "2026-01-01T14:00:00+00:00"}
    ]
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    result = await facade.get_timing_data(session_key=9999)

    by_num = {d["driver_number"]: d for d in result["drivers"]}
    assert by_num[1]["is_session_best"] is True
    assert by_num[44]["is_session_best"] is False


@pytest.mark.asyncio
async def test_is_personal_best_not_session_best():
    """is_personal_best is True (and is_session_best is False) when last lap equals
    personal best but is not the session best."""
    cache = TTLCache()
    drivers = [
        {"driver_number": 1, "name_acronym": "VER", "full_name": "M Verstappen",
         "team_name": "Red Bull", "team_colour": "FF0000", "country_code": "NL"},
        {"driver_number": 44, "name_acronym": "HAM", "full_name": "L Hamilton",
         "team_name": "Ferrari", "team_colour": "FF2800", "country_code": "GB"},
    ]
    positions = [
        {"driver_number": 1, "position": 1},
        {"driver_number": 44, "position": 2},
    ]
    # VER has session best (90 s).
    # HAM's last lap (92 s) equals his own personal best (also 92 s across two laps).
    laps = [
        {"driver_number": 1, "lap_number": 5, "lap_duration": 90.0,
         "is_pit_out_lap": False, "duration_sector_1": 30.0,
         "duration_sector_2": 30.0, "duration_sector_3": 30.0},
        # HAM's first lap was 95 s (slower), second is 92 s (personal best)
        {"driver_number": 44, "lap_number": 4, "lap_duration": 95.0,
         "is_pit_out_lap": False, "duration_sector_1": 32.0,
         "duration_sector_2": 32.0, "duration_sector_3": 31.0},
        {"driver_number": 44, "lap_number": 5, "lap_duration": 92.0,
         "is_pit_out_lap": False, "duration_sector_1": 31.0,
         "duration_sector_2": 31.0, "duration_sector_3": 30.0},
    ]
    openf1 = _make_openf1_mock(drivers=drivers, positions=positions, laps=laps)
    openf1.get_sessions.return_value = [
        {"session_key": 9999, "session_name": "Race", "session_type": "Race",
         "circuit_short_name": "Test", "country_name": "Testland",
         "date_start": "2026-01-01T12:00:00+00:00", "date_end": "2026-01-01T14:00:00+00:00"}
    ]
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    result = await facade.get_timing_data(session_key=9999)

    by_num = {d["driver_number"]: d for d in result["drivers"]}
    ham = by_num[44]
    assert ham["is_personal_best"] is True
    assert ham["is_session_best"] is False


@pytest.mark.asyncio
async def test_consecutive_pit_laps_grouped_into_one_stop():
    """Two pit entries on consecutive laps for the same driver become a single stop."""
    cache = TTLCache()
    drivers = [
        {"driver_number": 44, "name_acronym": "HAM", "full_name": "L Hamilton",
         "team_name": "Ferrari", "team_colour": "FF2800", "country_code": "GB"},
    ]
    positions = [{"driver_number": 44, "position": 1}]
    # Two consecutive pit entries — should be grouped into one stop
    pit_stops = [
        {"driver_number": 44, "lap_number": 20, "pit_duration": 2.5,
         "date": "2026-05-07T14:30:00+00:00"},
        {"driver_number": 44, "lap_number": 21, "pit_duration": None,
         "date": "2026-05-07T14:30:30+00:00"},
    ]
    openf1 = _make_openf1_mock(drivers=drivers, positions=positions, pit_stops=pit_stops)
    openf1.get_sessions.return_value = [
        {"session_key": 9999, "session_name": "Race", "session_type": "Race",
         "circuit_short_name": "Test", "country_name": "Testland",
         "date_start": "2026-01-01T12:00:00+00:00", "date_end": "2026-01-01T14:00:00+00:00"}
    ]
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    result = await facade.get_timing_data(session_key=9999)

    # There should be exactly one pit stop entry for driver 44
    driver_44_stops = [s for s in result["pit_stops"] if s["driver_number"] == 44]
    assert len(driver_44_stops) == 1
    assert driver_44_stops[0]["lap_number"] == 20  # first lap of the group
    assert driver_44_stops[0]["pit_duration"] == 2.5  # best duration from group


@pytest.mark.asyncio
async def test_non_consecutive_pit_laps_create_two_stops():
    """Pit entries on non-consecutive laps (gap > 1) create two separate stops."""
    cache = TTLCache()
    drivers = [
        {"driver_number": 44, "name_acronym": "HAM", "full_name": "L Hamilton",
         "team_name": "Ferrari", "team_colour": "FF2800", "country_code": "GB"},
    ]
    positions = [{"driver_number": 44, "position": 1}]
    pit_stops = [
        {"driver_number": 44, "lap_number": 20, "pit_duration": 2.5,
         "date": "2026-05-07T14:30:00+00:00"},
        {"driver_number": 44, "lap_number": 40, "pit_duration": 2.7,
         "date": "2026-05-07T15:10:00+00:00"},
    ]
    openf1 = _make_openf1_mock(drivers=drivers, positions=positions, pit_stops=pit_stops)
    openf1.get_sessions.return_value = [
        {"session_key": 9999, "session_name": "Race", "session_type": "Race",
         "circuit_short_name": "Test", "country_name": "Testland",
         "date_start": "2026-01-01T12:00:00+00:00", "date_end": "2026-01-01T14:00:00+00:00"}
    ]
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    result = await facade.get_timing_data(session_key=9999)

    driver_44_stops = [s for s in result["pit_stops"] if s["driver_number"] == 44]
    assert len(driver_44_stops) == 2


@pytest.mark.asyncio
async def test_ttl_is_5_seconds_when_session_is_live():
    """Cache TTL is 5 seconds when the session is live."""
    import time
    cache = TTLCache()
    drivers = [
        {"driver_number": 1, "name_acronym": "VER", "full_name": "M Verstappen",
         "team_name": "Red Bull", "team_colour": "FF0000", "country_code": "NL"},
    ]
    positions = [{"driver_number": 1, "position": 1}]
    openf1 = _make_openf1_mock(drivers=drivers, positions=positions)

    # Mark the session as live via get_sessions returning a live window
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    openf1.get_sessions.return_value = [
        {
            "session_key": 9999,
            "session_name": "Race",
            "session_type": "Race",
            "circuit_short_name": "Test",
            "country_name": "Testland",
            "date_start": (now - timedelta(hours=1)).isoformat(),
            "date_end": (now + timedelta(hours=1)).isoformat(),
        }
    ]
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    await facade.get_timing_data(session_key=9999)

    entry = cache._store.get("live_timing_9999")
    assert entry is not None
    _, expires_at = entry
    # TTL should be ~5 seconds; expires_at should be very close to now + 5
    expected_expiry = time.monotonic() + 5
    assert abs(expires_at - expected_expiry) < 1.0


@pytest.mark.asyncio
async def test_ttl_is_60_seconds_when_session_is_not_live():
    """Cache TTL is 60 seconds when the session is not live."""
    import time
    cache = TTLCache()
    drivers = [
        {"driver_number": 1, "name_acronym": "VER", "full_name": "M Verstappen",
         "team_name": "Red Bull", "team_colour": "FF0000", "country_code": "NL"},
    ]
    positions = [{"driver_number": 1, "position": 1}]
    openf1 = _make_openf1_mock(drivers=drivers, positions=positions)
    openf1.get_sessions.return_value = [
        {
            "session_key": 9999,
            "session_name": "Race",
            "session_type": "Race",
            "circuit_short_name": "Test",
            "country_name": "Testland",
            "date_start": "2026-01-01T12:00:00+00:00",
            "date_end": "2026-01-01T14:00:00+00:00",  # in the past
        }
    ]
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    await facade.get_timing_data(session_key=9999)

    entry = cache._store.get("live_timing_9999")
    assert entry is not None
    _, expires_at = entry
    expected_expiry = time.monotonic() + 60
    assert abs(expires_at - expected_expiry) < 1.0


# ── get_session_key_for_round ─────────────────────────────────────────────────

def _make_key_lookup_facade(meetings=None, sessions=None):
    openf1 = AsyncMock()
    openf1.get_meetings.return_value = meetings or []
    openf1.get_sessions.return_value = sessions or []
    return LiveTimingFacade(openf1=openf1, cache=TTLCache())


@pytest.mark.asyncio
async def test_get_live_session_returns_stale_when_openf1_blocked():
    """When OpenF1 returns empty (e.g. 401 during a live session), stale cache is used."""
    cache = TTLCache()
    stale_session = {
        "session_key": 9999,
        "session_name": "Race",
        "session_type": "Race",
        "circuit": "Test",
        "country": "Testland",
        "date_start": "2026-06-06T14:00:00+00:00",
        "date_end": "2026-06-06T16:00:00+00:00",
        "is_live": True,
    }
    import time
    # Seed an already-expired cache entry directly (bypassing set's pruning)
    cache._store["live_session_info"] = (stale_session, time.monotonic() - 100)

    openf1 = AsyncMock()
    openf1.get_sessions.return_value = []  # 401 → empty list
    facade = LiveTimingFacade(openf1=openf1, cache=cache)

    result = await facade.get_live_session()

    assert result is not None
    assert result["session_key"] == 9999
    assert result["is_live"] is True


# ── get_session_key_for_round ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_session_key_prefers_session_name_over_type():
    """session_name='Race' beats session_type='Race' (Sprint disambiguation).

    Sprint sessions have session_type='Race' but session_name='Sprint'.
    When asked for 'Race', we must return the session with session_name='Race'
    and not the Sprint session.
    """
    meetings = [
        {"meeting_key": 1, "meeting_name": "Miami Grand Prix", "date_start": "2026-05-01"}
    ]
    sessions = [
        {"session_key": 201, "session_name": "Sprint", "session_type": "Race"},
        {"session_key": 202, "session_name": "Race",   "session_type": "Race"},
    ]
    facade = _make_key_lookup_facade(meetings=meetings, sessions=sessions)

    result = await facade.get_session_key_for_round(2026, 1, "Race")

    assert result["session_key"] == 202


@pytest.mark.asyncio
async def test_session_key_falls_back_to_type_when_no_name_match():
    """Falls back to session_type match when no session_name matches the requested type."""
    meetings = [
        {"meeting_key": 1, "meeting_name": "Miami Grand Prix", "date_start": "2026-05-01"}
    ]
    sessions = [
        {"session_key": 201, "session_name": "Practice 1", "session_type": "Practice"},
        {"session_key": 202, "session_name": "Qualifying",  "session_type": "Qualifying"},
    ]
    facade = _make_key_lookup_facade(meetings=meetings, sessions=sessions)

    result = await facade.get_session_key_for_round(2026, 1, "Qualifying")

    assert result["session_key"] == 202


@pytest.mark.asyncio
async def test_session_key_date_matching_picks_closest_meeting():
    """When race_date is provided, picks the meeting closest by date rather than by index."""
    meetings = [
        {"meeting_key": 1, "meeting_name": "Australian Grand Prix", "date_start": "2026-03-15"},
        {"meeting_key": 2, "meeting_name": "Chinese Grand Prix",    "date_start": "2026-03-22"},
        {"meeting_key": 3, "meeting_name": "Japanese Grand Prix",   "date_start": "2026-04-05"},
    ]
    sessions_for_meeting_2 = [
        {"session_key": 501, "session_name": "Race", "session_type": "Race"},
    ]
    openf1 = AsyncMock()
    openf1.get_meetings.return_value = meetings
    openf1.get_sessions.return_value = sessions_for_meeting_2
    facade = LiveTimingFacade(openf1=openf1, cache=TTLCache())

    # race_date matches Chinese GP most closely
    result = await facade.get_session_key_for_round(2026, 1, "Race", race_date="2026-03-23")

    assert result["session_key"] == 501


@pytest.mark.asyncio
async def test_session_key_not_found_returns_error():
    """Returns {session_key: None, error: ...} when round number is out of range."""
    meetings = [
        {"meeting_key": 1, "meeting_name": "Australian Grand Prix", "date_start": "2026-03-15"}
    ]
    facade = _make_key_lookup_facade(meetings=meetings)

    result = await facade.get_session_key_for_round(2026, 99, "Race")

    assert result["session_key"] is None
    assert "error" in result


@pytest.mark.asyncio
async def test_session_key_no_matching_session_type_returns_error():
    """Returns error when sessions exist but none match the requested type."""
    meetings = [
        {"meeting_key": 1, "meeting_name": "Miami Grand Prix", "date_start": "2026-05-01"}
    ]
    sessions = [
        {"session_key": 201, "session_name": "Practice 1", "session_type": "Practice"},
    ]
    facade = _make_key_lookup_facade(meetings=meetings, sessions=sessions)

    result = await facade.get_session_key_for_round(2026, 1, "Race")

    assert result["session_key"] is None
    assert "error" in result
