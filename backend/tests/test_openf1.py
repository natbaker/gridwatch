import httpx
import pytest

from app.services.clients.openf1 import OpenF1Client


@pytest.fixture
def mock_transport():
    responses = {
        "/v1/sessions?meeting_key=latest": httpx.Response(200, json=[
            {"session_key": 9510, "session_name": "Practice 1", "session_type": "Practice",
             "date_start": "2026-03-27T02:30:00+00:00", "date_end": "2026-03-27T03:30:00+00:00",
             "meeting_key": 1234, "circuit_short_name": "Suzuka"},
            {"session_key": 9511, "session_name": "Qualifying", "session_type": "Qualifying",
             "date_start": "2026-03-28T06:00:00+00:00", "date_end": "2026-03-28T07:00:00+00:00",
             "meeting_key": 1234, "circuit_short_name": "Suzuka"},
        ]),
        "/v1/meetings?year=2026": httpx.Response(200, json=[
            {"meeting_key": 1234, "meeting_name": "Japanese Grand Prix",
             "circuit_short_name": "Suzuka", "country_name": "Japan",
             "date_start": "2026-03-27T00:00:00+00:00"},
        ]),
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        query = request.url.query
        if isinstance(query, bytes):
            query = query.decode()
        key = f"{request.url.path}?{query}" if query else request.url.path
        if key in responses:
            return responses[key]
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def client(mock_transport):
    http = httpx.AsyncClient(transport=mock_transport, base_url="http://test/v1")
    return OpenF1Client(http)


@pytest.mark.asyncio
async def test_get_latest_sessions(client):
    sessions = await client.get_latest_sessions()
    assert len(sessions) == 2
    assert sessions[0]["session_name"] == "Practice 1"


@pytest.mark.asyncio
async def test_get_meetings(client):
    meetings = await client.get_meetings(2026)
    assert len(meetings) == 1
    assert meetings[0]["meeting_name"] == "Japanese Grand Prix"
