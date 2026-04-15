import asyncio

import httpx
import pytest

from app.services.clients.jolpica import JolpicaClient


@pytest.fixture
def mock_transport():
    """Returns a transport that serves canned Jolpica responses."""
    responses = {
        "/ergast/f1/2026.json": httpx.Response(200, json={
            "MRData": {"RaceTable": {"season": "2026", "Races": [
                {
                    "round": "1",
                    "raceName": "Australian Grand Prix",
                    "Circuit": {
                        "circuitName": "Albert Park Grand Prix Circuit",
                        "Location": {"lat": "-37.8497", "long": "144.968", "locality": "Melbourne", "country": "Australia"},
                    },
                    "date": "2026-03-08",
                    "time": "05:00:00Z",
                    "FirstPractice": {"date": "2026-03-06", "time": "01:30:00Z"},
                    "SecondPractice": {"date": "2026-03-06", "time": "05:00:00Z"},
                    "ThirdPractice": {"date": "2026-03-07", "time": "01:30:00Z"},
                    "Qualifying": {"date": "2026-03-07", "time": "05:00:00Z"},
                }
            ]}}
        }),
        "/ergast/f1/2026/driverStandings.json": httpx.Response(200, json={
            "MRData": {"StandingsTable": {"season": "2026", "StandingsLists": [
                {"round": "2", "DriverStandings": [
                    {"position": "1", "points": "51", "wins": "1",
                     "Driver": {"givenName": "George", "familyName": "Russell", "code": "RUS"},
                     "Constructors": [{"name": "Mercedes"}]},
                ]}
            ]}}
        }),
        "/ergast/f1/2026/constructorStandings.json": httpx.Response(200, json={
            "MRData": {"StandingsTable": {"season": "2026", "StandingsLists": [
                {"round": "2", "ConstructorStandings": [
                    {"position": "1", "points": "98", "wins": "2",
                     "Constructor": {"name": "Mercedes"}},
                ]}
            ]}}
        }),
        "/ergast/f1/2026/last/results.json": httpx.Response(200, json={
            "MRData": {"RaceTable": {"Races": [
                {"raceName": "Chinese Grand Prix", "round": "2", "Results": [
                    {"position": "1", "Driver": {"givenName": "Kimi", "familyName": "Antonelli", "code": "ANT"},
                     "Constructor": {"name": "Mercedes"}, "Time": {"time": "1:33:15.801"}, "status": "Finished"},
                    {"position": "2", "Driver": {"givenName": "George", "familyName": "Russell", "code": "RUS"},
                     "Constructor": {"name": "Mercedes"}, "Time": {"time": "+5.515"}, "status": "Finished"},
                ]}
            ]}}
        }),
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path in responses:
            return responses[path]
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def client(mock_transport):
    http = httpx.AsyncClient(transport=mock_transport, base_url="http://test/ergast/f1")
    semaphore = asyncio.Semaphore(4)
    return JolpicaClient(http, semaphore)


@pytest.mark.asyncio
async def test_get_schedule(client):
    races = await client.get_schedule(2026)
    assert len(races) == 1
    assert races[0]["round"] == "1"
    assert races[0]["raceName"] == "Australian Grand Prix"


@pytest.mark.asyncio
async def test_get_driver_standings(client):
    standings = await client.get_driver_standings(2026)
    assert standings["round"] == "2"
    assert len(standings["drivers"]) == 1
    assert standings["drivers"][0]["code"] == "RUS"


@pytest.mark.asyncio
async def test_get_constructor_standings(client):
    standings = await client.get_constructor_standings(2026)
    assert standings["round"] == "2"
    assert len(standings["constructors"]) == 1


@pytest.mark.asyncio
async def test_get_latest_results(client):
    results = await client.get_latest_results(2026)
    assert results["race_name"] == "Chinese Grand Prix"
    assert len(results["results"]) == 2
