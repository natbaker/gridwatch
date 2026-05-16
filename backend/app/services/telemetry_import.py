"""On-demand import of car_data/location for a session from openf1.org into local MongoDB."""
import asyncio
import json
import logging
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="telemetry-import")
_status: dict[int, dict] = {}

SOURCE_URL = "https://api.openf1.org/v1"
RATE_DELAY = 0.4


def _get(url: str, timeout: int = 60) -> bytes:
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 204, 422):
                return b""
            if e.code == 429:
                wait = (attempt + 1) * 30
                time.sleep(wait)
                continue
            raise
    return b""


def _fetch_json(path: str, params: dict) -> list:
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    raw = _get(f"{SOURCE_URL}/{path}?{qs}")
    return json.loads(raw) if raw else []


def _run_import(session_key: int, mongo_url: str, db_name: str) -> None:
    from pymongo import MongoClient

    s = _status[session_key]
    try:
        mongo = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        db = mongo[db_name]

        s["progress"] = "fetching drivers"
        drivers = _fetch_json("drivers", {"session_key": session_key})
        driver_numbers = [d["driver_number"] for d in drivers if d.get("driver_number")]
        if not driver_numbers:
            s["status"] = "error"
            s["progress"] = "no drivers found"
            return

        s["total_drivers"] = len(driver_numbers)

        for endpoint in ("car_data", "location"):
            total = 0
            for i, dn in enumerate(driver_numbers):
                s["progress"] = f"{endpoint} {i + 1}/{len(driver_numbers)}"
                rows = _fetch_json(endpoint, {"session_key": session_key, "driver_number": dn})
                if rows:
                    try:
                        db[endpoint].insert_many(rows, ordered=False)
                    except Exception:
                        pass
                    total += len(rows)
                time.sleep(RATE_DELAY)
            s[endpoint] = total

        # Mark session as having telemetry so gap_fill skips it
        db["_imported_sessions"].update_one(
            {"session_key": session_key},
            {"$set": {"has_telemetry": True}},
            upsert=True,
        )

        s["status"] = "done"
        s["progress"] = "complete"
        mongo.close()
    except Exception as e:
        s["status"] = "error"
        s["progress"] = str(e)
        logger.error("Telemetry import failed for session %s: %s", session_key, e)


async def start_import(session_key: int, mongo_url: str, db_name: str) -> dict:
    existing = _status.get(session_key)
    if existing and existing.get("status") == "running":
        return {"status": "already_running", "session_key": session_key, **existing}

    _status[session_key] = {"status": "running", "progress": "queued"}
    loop = asyncio.get_event_loop()
    loop.run_in_executor(_executor, _run_import, session_key, mongo_url, db_name)
    return {"status": "started", "session_key": session_key}


def get_status(session_key: int) -> dict:
    return _status.get(session_key, {"status": "not_started"})
