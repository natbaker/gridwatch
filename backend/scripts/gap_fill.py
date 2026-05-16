"""Import missing OpenF1 sessions from openf1.org into local MongoDB.

On first run against an empty MongoDB this acts as a full historical bootstrap.
On subsequent runs it only imports sessions not yet present locally.

Sessions that were previously "imported" but had no actual data (e.g. the script
ran before a race happened) will be retried automatically.

Env vars:
  MONGO_CONNECTION_STRING  default: mongodb://localhost:27017
  OPENF1_DB_NAME           default: openf1-livetiming
  OPENF1_SOURCE_URL        default: https://api.openf1.org/v1
  SKIP_TELEMETRY           set to "1" to skip car_data/location (faster, ~2h saved)
"""
import json
import logging
import os
import time
import urllib.request
import urllib.error

from pymongo import MongoClient

MONGO_URL = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("OPENF1_DB_NAME", "openf1-livetiming")
SOURCE_URL = os.getenv("OPENF1_SOURCE_URL", "https://api.openf1.org/v1").rstrip("/")
SKIP_TELEMETRY = os.getenv("SKIP_TELEMETRY", "") == "1"

# Endpoints that support bulk CSV export per session_key.
BULK_ENDPOINTS = [
    "drivers", "intervals", "laps",
    "pit", "position", "race_control", "stints", "team_radio", "weather",
]
# car_data and location require per-driver JSON fetches (bulk CSV returns 422).
PER_DRIVER_ENDPOINTS = ["car_data", "location"]

YEARS = [2023, 2024, 2025, 2026]
RATE_DELAY = 0.4  # ~25 req/10s, under the 30/10s hosted limit

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)


def _get(url: str, timeout: int) -> bytes:
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 204, 422):
                return b""
            if e.code == 429:
                wait = (attempt + 1) * 30
                log.info(f"Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            raise
    return b""


def fetch_json(path: str, params: dict) -> list:
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    raw = _get(f"{SOURCE_URL}/{path}?{qs}", timeout=60)
    return json.loads(raw) if raw else []


def fetch_csv_raw(path: str, params: dict) -> list[dict]:
    import csv, io
    qs = "&".join(f"{k}={v}" for k, v in {**params, "csv": "true"}.items())
    raw = _get(f"{SOURCE_URL}/{path}?{qs}", timeout=300)
    return list(csv.DictReader(io.StringIO(raw.decode()))) if raw else []


def coerce(val: str):
    if val == "":
        return None
    for fn in (int, float):
        try:
            return fn(val)
        except ValueError:
            pass
    return {"true": True, "false": False}.get(val.lower(), val)


def parse_row(row: dict) -> dict:
    return {k: coerce(v) for k, v in row.items()}


def insert(db, collection: str, docs: list):
    if not docs:
        return
    try:
        db[collection].insert_many(docs, ordered=False)
    except Exception:
        pass  # duplicate key errors on retry — safe to ignore


def import_bulk(db, session_key: int) -> int:
    """Import all bulk endpoints for a session. Returns total rows inserted."""
    total = 0
    for endpoint in BULK_ENDPOINTS:
        rows = fetch_csv_raw(endpoint, {"session_key": session_key})
        if rows:
            docs = [parse_row(r) for r in rows]
            insert(db, endpoint, docs)
            total += len(docs)
            log.info(f"  {endpoint}: {len(docs)}")
        time.sleep(RATE_DELAY)
    return total


def import_telemetry(db, session_key: int):
    driver_docs = fetch_json("drivers", {"session_key": session_key})
    driver_numbers = [d["driver_number"] for d in driver_docs if d.get("driver_number")]
    time.sleep(RATE_DELAY)

    for endpoint in PER_DRIVER_ENDPOINTS:
        total = 0
        for driver_number in driver_numbers:
            rows = fetch_json(endpoint, {"session_key": session_key, "driver_number": driver_number})
            if rows:
                insert(db, endpoint, rows)
                total += len(rows)
            time.sleep(RATE_DELAY)
        if total:
            log.info(f"  {endpoint}: {total}")


def main():
    mongo = MongoClient(MONGO_URL)
    db = mongo[DB_NAME]

    remote_keys = []
    for year in YEARS:
        sessions = fetch_json("sessions", {"year": year})
        remote_keys.extend(s["session_key"] for s in sessions if s.get("session_key"))
        time.sleep(RATE_DELAY)

    tracking = {
        doc["session_key"]: doc
        for doc in db["_imported_sessions"].find({}, {"session_key": 1, "has_telemetry": 1, "has_data": 1})
    }

    # Sessions to (re)import: not tracked, or tracked without confirmed data.
    # First check local MongoDB to avoid re-fetching what ingest-realtime already captured.
    needs_check = [k for k in remote_keys if k not in tracking or not tracking[k].get("has_data")]

    missing_bulk = []
    for k in needs_check:
        has_local = bool(db["laps"].count_documents({"session_key": k}, limit=1))
        if has_local:
            # Data is already in MongoDB (from ingest-realtime); just fix the tracking entry.
            db["_imported_sessions"].update_one(
                {"session_key": k},
                {"$set": {"has_data": True}},
                upsert=True,
            )
            log.info(f"Session {k}: already in MongoDB, marked as imported")
        else:
            missing_bulk.append(k)

    missing_telemetry = (
        [] if SKIP_TELEMETRY
        else [
            k for k in remote_keys
            if k in tracking and tracking[k].get("has_data") and not tracking[k].get("has_telemetry")
        ]
    )

    if not missing_bulk and not missing_telemetry:
        log.info("Nothing to import.")
        return

    if missing_bulk:
        log.info(f"Importing {len(missing_bulk)} sessions...")
        for session_key in missing_bulk:
            log.info(f"Session {session_key}")
            total = import_bulk(db, session_key)
            if not total:
                log.info(f"  no data available yet, skipping tracking")
                continue
            if not SKIP_TELEMETRY:
                import_telemetry(db, session_key)
                db["_imported_sessions"].update_one(
                    {"session_key": session_key},
                    {"$set": {"has_data": True, "has_telemetry": True}},
                    upsert=True,
                )
            else:
                db["_imported_sessions"].update_one(
                    {"session_key": session_key},
                    {"$set": {"has_data": True, "has_telemetry": False}},
                    upsert=True,
                )

    if missing_telemetry:
        log.info(f"Backfilling telemetry for {len(missing_telemetry)} sessions...")
        for session_key in missing_telemetry:
            log.info(f"Telemetry {session_key}")
            import_telemetry(db, session_key)
            db["_imported_sessions"].update_one(
                {"session_key": session_key},
                {"$set": {"has_telemetry": True}},
            )

    log.info("Done.")
    mongo.close()


if __name__ == "__main__":
    main()
