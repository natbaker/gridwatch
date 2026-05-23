"""Tests for mongo_direct.query_session."""

import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.asyncio
async def test_returns_empty_when_not_configured(monkeypatch):
    """Returns [] without error when MONGO_CONNECTION_STRING is empty."""
    monkeypatch.setenv("GRIDWATCH_MONGO_CONNECTION_STRING", "")

    # Reload settings and module so the empty string takes effect
    import importlib
    import app.config as config_mod
    import app.services.mongo_direct as md_mod

    importlib.reload(config_mod)
    importlib.reload(md_mod)

    result = await md_mod.query_session("laps", 9999)
    assert result == []


@pytest.mark.asyncio
async def test_returns_documents_from_collection(monkeypatch):
    """Returns documents from the correct collection when MongoDB is configured."""
    monkeypatch.setenv("GRIDWATCH_MONGO_CONNECTION_STRING", "mongodb://localhost:27017")

    fake_docs = [
        {"session_key": 9999, "lap_number": 1, "driver_number": 44},
        {"session_key": 9999, "lap_number": 2, "driver_number": 44},
    ]

    mock_cursor = MagicMock()
    mock_cursor.__iter__ = MagicMock(return_value=iter(fake_docs))
    mock_collection = MagicMock()
    mock_collection.find.return_value = mock_cursor
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    mock_client = MagicMock()
    mock_client.__getitem__ = MagicMock(return_value=mock_db)

    import importlib
    import app.config as config_mod
    importlib.reload(config_mod)

    import app.services.mongo_direct as md_mod
    importlib.reload(md_mod)
    md_mod._client = mock_client  # inject mock client

    result = await md_mod.query_session("laps", 9999)

    mock_db.__getitem__.assert_called_with("laps")
    mock_collection.find.assert_called_once_with(
        {"session_key": 9999}, {"_id": 0, "_key": 0}
    )
    assert result == list(fake_docs)


@pytest.mark.asyncio
async def test_queries_correct_collection_name(monkeypatch):
    """Passes the collection name exactly as given to MongoDB."""
    monkeypatch.setenv("GRIDWATCH_MONGO_CONNECTION_STRING", "mongodb://localhost:27017")

    mock_cursor = MagicMock()
    mock_cursor.__iter__ = MagicMock(return_value=iter([]))
    mock_collection = MagicMock()
    mock_collection.find.return_value = mock_cursor
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    mock_client = MagicMock()
    mock_client.__getitem__ = MagicMock(return_value=mock_db)

    import importlib
    import app.config as config_mod
    importlib.reload(config_mod)

    import app.services.mongo_direct as md_mod
    importlib.reload(md_mod)
    md_mod._client = mock_client

    await md_mod.query_session("team_radio", 1234)

    mock_db.__getitem__.assert_called_with("team_radio")


@pytest.mark.asyncio
async def test_returns_empty_on_exception(monkeypatch):
    """Returns [] and logs warning when MongoDB query raises an exception."""
    monkeypatch.setenv("GRIDWATCH_MONGO_CONNECTION_STRING", "mongodb://localhost:27017")

    mock_collection = MagicMock()
    mock_collection.find.side_effect = Exception("connection timeout")
    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    mock_client = MagicMock()
    mock_client.__getitem__ = MagicMock(return_value=mock_db)

    import importlib
    import app.config as config_mod
    importlib.reload(config_mod)

    import app.services.mongo_direct as md_mod
    importlib.reload(md_mod)
    md_mod._client = mock_client

    result = await md_mod.query_session("laps", 9999)
    assert result == []
