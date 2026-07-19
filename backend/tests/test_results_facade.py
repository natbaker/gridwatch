"""Behavioral tests for ResultsFacade.get_qualifying_results using mocked clients."""

import time

import pytest
from unittest.mock import AsyncMock

from app.cache import TTLCache
from app.services.clients.jolpica import JolpicaClient
from app.services.facades.results import ResultsFacade


def _make_jolpica_mock(raises=False, qualifying_data=None):
    mock = AsyncMock(spec=JolpicaClient)
    if raises:
        mock.get_qualifying_results.side_effect = Exception("Jolpica unavailable")
    else:
        mock.get_qualifying_results.return_value = qualifying_data or {
            "race_name": "British Grand Prix",
            "round": "12",
            "circuit": "Silverstone Circuit",
            "date": "2026-07-19",
            "qualifying": [
                {
                    "position": "1", "code": "VER",
                    "given_name": "Max", "family_name": "Verstappen",
                    "constructor": "Red Bull",
                    "q1": "1:25.100", "q2": "1:24.800", "q3": "1:24.311",
                },
                {
                    "position": "2", "code": "NOR",
                    "given_name": "Lando", "family_name": "Norris",
                    "constructor": "McLaren",
                    "q1": "1:25.300", "q2": "1:25.000", "q3": "1:24.423",
                },
            ],
        }
    return mock


def _make_facade(jolpica=None, cache=None):
    return ResultsFacade(jolpica=jolpica or _make_jolpica_mock(), cache=cache or TTLCache())


@pytest.mark.asyncio
async def test_get_qualifying_results_success():
    facade = _make_facade()

    result = await facade.get_qualifying_results(12, season=2026)

    assert result["race_name"] == "British Grand Prix"
    assert result["round"] == 12
    assert result["warnings"] == []
    assert len(result["qualifying"]) == 2
    first = result["qualifying"][0]
    assert first["position"] == 1
    assert first["driver"] == "Max Verstappen"
    assert first["abbreviation"] == "VER"
    assert first["team"] == "Red Bull"
    assert first["team_color"] == "#3671C6"
    assert first["q3"] == "1:24.311"


@pytest.mark.asyncio
async def test_get_qualifying_results_falls_back_to_stale_cache_on_failure():
    cache = TTLCache()
    stale_value = {
        "race_name": "British Grand Prix", "round": 12, "date": "2026-07-19",
        "qualifying": [{"position": 1, "driver": "Max Verstappen", "abbreviation": "VER",
                         "team": "Red Bull", "team_color": "#3671C6",
                         "q1": "1:25.100", "q2": "1:24.800", "q3": "1:24.311"}],
        "warnings": [],
    }
    cache._store["results_qualifying_2026_12"] = (stale_value, time.monotonic() - 100)  # already expired
    facade = _make_facade(jolpica=_make_jolpica_mock(raises=True), cache=cache)

    result = await facade.get_qualifying_results(12, season=2026)

    assert result["warnings"] == ["Using cached results"]
    assert result["qualifying"][0]["driver"] == "Max Verstappen"


@pytest.mark.asyncio
async def test_get_qualifying_results_empty_when_no_cache_and_fetch_fails():
    facade = _make_facade(jolpica=_make_jolpica_mock(raises=True), cache=TTLCache())

    result = await facade.get_qualifying_results(12, season=2026)

    assert result["qualifying"] == []
    assert result["warnings"] == ["Qualifying results unavailable"]
