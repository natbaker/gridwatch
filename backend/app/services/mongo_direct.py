"""Direct MongoDB queries for bulk session data, bypassing the openf1-api.

The openf1 query API deduplicates documents by a `_key` field set by ingest-realtime.
Gap_fill-imported documents have no `_key`, so they all collapse to 1 result.
This module queries MongoDB directly to return all documents for a session.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from app.config import settings

logger = logging.getLogger(__name__)

_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mongo-reader")
_client = None
_client_lock = asyncio.Lock()


def _get_client():
    global _client
    if _client is None and settings.mongo_connection_string:
        from pymongo import MongoClient
        _client = MongoClient(settings.mongo_connection_string, serverSelectionTimeoutMS=5000)
    return _client


def _sync_query(collection: str, session_key: int) -> list[dict]:
    client = _get_client()
    if client is None:
        return []
    db = client[settings.openf1_db_name]
    return list(db[collection].find({"session_key": session_key}, {"_id": 0, "_key": 0}))


# Collections populated by gap_fill.py (backend/scripts/gap_fill.py) for a session.
GAP_FILL_COLLECTIONS = [
    "drivers", "intervals", "laps", "pit", "position",
    "race_control", "stints", "team_radio", "weather",
    "car_data", "location",
]


def _sync_purge(session_key: int) -> None:
    client = _get_client()
    if client is None:
        return
    db = client[settings.openf1_db_name]
    for collection in GAP_FILL_COLLECTIONS:
        db[collection].delete_many({"session_key": session_key})
    db["_imported_sessions"].delete_one({"session_key": session_key})


async def query_session(collection: str, session_key: int) -> list[dict]:
    """Return all documents for session_key from collection, or [] if MongoDB not configured."""
    if not settings.mongo_connection_string:
        return []
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(_pool, _sync_query, collection, session_key)
    except Exception as e:
        logger.warning("mongo_direct query failed for %s/%s: %s", collection, session_key, e)
        return []


async def purge_session(session_key: int) -> bool:
    """Delete a session's gap_fill-imported data and tracking entry so the next
    gap_fill run treats it as missing and re-imports it fresh."""
    if not settings.mongo_connection_string:
        return False
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_pool, _sync_purge, session_key)
        return True
    except Exception as e:
        logger.warning("mongo_direct purge failed for session %s: %s", session_key, e)
        return False
