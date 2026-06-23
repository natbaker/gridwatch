"""Tests for timing-payload additions backing the strategy & sector features."""

import pytest

from app.cache import TTLCache
from app.services.facades.live_timing import LiveTimingFacade
from tests.test_live_timing_facade import _make_openf1_mock

_SESSION = [
    {"session_key": 9999, "session_name": "Race", "session_type": "Race",
     "circuit_short_name": "Test", "country_name": "Testland",
     "date_start": "2026-01-01T12:00:00+00:00", "date_end": "2026-01-01T14:00:00+00:00"}
]

_DRIVERS = [
    {"driver_number": 1, "name_acronym": "VER", "full_name": "M Verstappen",
     "team_name": "Red Bull", "team_colour": "3671C6", "country_code": "NL"},
    {"driver_number": 44, "name_acronym": "HAM", "full_name": "L Hamilton",
     "team_name": "Ferrari", "team_colour": "E80020", "country_code": "GB"},
]


@pytest.mark.asyncio
async def test_strategy_lists_full_stint_history_per_driver():
    stints = [
        {"driver_number": 1, "stint_number": 2, "compound": "HARD", "lap_start": 16, "lap_end": 30},
        {"driver_number": 1, "stint_number": 1, "compound": "SOFT", "lap_start": 1, "lap_end": 15},
    ]
    openf1 = _make_openf1_mock(drivers=_DRIVERS, positions=[{"driver_number": 1, "position": 1}],
                               stints=stints, sessions=_SESSION)
    facade = LiveTimingFacade(openf1=openf1, cache=TTLCache())

    result = await facade.get_timing_data(session_key=9999)
    strategy = {s["driver_number"]: s for s in result["strategy"]}

    assert 1 in strategy
    ver = strategy[1]["stints"]
    # Ordered by stint_number ascending.
    assert [s["compound"] for s in ver] == ["SOFT", "HARD"]
    assert ver[0]["lap_start"] == 1 and ver[0]["lap_end"] == 15
    assert ver[0]["compound_short"] == "S"


@pytest.mark.asyncio
async def test_best_sectors_session_and_per_driver():
    laps = [
        {"driver_number": 1, "lap_number": 5, "lap_duration": 91.0, "is_pit_out_lap": False,
         "duration_sector_1": 30.0, "duration_sector_2": 30.5, "duration_sector_3": 30.5},
        {"driver_number": 44, "lap_number": 5, "lap_duration": 90.6, "is_pit_out_lap": False,
         "duration_sector_1": 29.8, "duration_sector_2": 30.6, "duration_sector_3": 30.2},
    ]
    openf1 = _make_openf1_mock(drivers=_DRIVERS,
                               positions=[{"driver_number": 1, "position": 1},
                                          {"driver_number": 44, "position": 2}],
                               laps=laps, sessions=_SESSION)
    facade = LiveTimingFacade(openf1=openf1, cache=TTLCache())

    result = await facade.get_timing_data(session_key=9999)

    # Session-best sectors take the minimum across all drivers.
    assert result["best_sectors"]["sector_1"] == pytest.approx(29.8)
    assert result["best_sectors"]["sector_2"] == pytest.approx(30.5)
    assert result["best_sectors"]["sector_3"] == pytest.approx(30.2)

    by_num = {d["driver_number"]: d for d in result["drivers"]}
    assert by_num[1]["best_sector_1"] == pytest.approx(30.0)
    assert by_num[44]["best_sector_1"] == pytest.approx(29.8)
