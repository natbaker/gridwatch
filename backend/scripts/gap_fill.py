"""Import missing OpenF1 sessions from openf1.org into local MongoDB.

On first run against an empty MongoDB this acts as a full historical bootstrap.
On subsequent runs it only imports sessions not yet present locally.

Env vars:
  MONGO_CONNECTION_STRING  default: mongodb://localhost:27017
  OPENF1_DB_NAME           default: openf1-livetiming
  OPENF1_SOURCE_URL        default: https://api.openf1.org/v1
"""
import csv
import io
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

# car_data and location are excluded: openf1.org rejects bulk CSV exports
# for these (422). They are captured in real-time by ingest-realtime for
# future sessions, and fetched on-demand from openf1.org for older ones.
TIMING_ENDPOINTS = [
    "drivers", "intervals", "laps",
    "pit", "position", "race_control", "stints", "team_radio", "weather",
]
YEARS = [2023, 2024, 2025, 2026]
RATE_DELAY = 0.4  # ~25 req/10s, under the 30/10s hosted limit

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)


def fetch_json(path: str, params: dict) -> list:
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{SOURCE_URL}/{path}?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (404, 204):
            return []
        raise


def fetch_csv(path: str, params: dict) -> list[dict]:
    qs = "&".join(f"{k}={v}" for k, v in {**params, "csv": "true"}.items())
    url = f"{SOURCE_URL}/{path}?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=300) as r:
            return list(csv.DictReader(io.StringIO(r.read().decode())))
    except urllib.error.HTTPError as e:
        if e.code in (404, 204, 422):
            return []
        raise


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


def import_session(db, session_key: int):
    for endpoint in TIMING_ENDPOINTS:
        rows = fetch_csv(endpoint, {"session_key": session_key})
        if rows:
            docs = [parse_row(r) for r in rows]
            try:
                db[endpoint].insert_many(docs, ordered=False)
            except Exception:
                pass  # duplicate key errors on retry — safe to ignore
            log.info(f"  {endpoint}: {len(docs)}")
        time.sleep(RATE_DELAY)

    db["_imported_sessions"].insert_one({"session_key": session_key})


def main():
    mongo = MongoClient(MONGO_URL)
    db = mongo[DB_NAME]

    remote_keys = []
    for year in YEARS:
        sessions = fetch_json("sessions", {"year": year})
        remote_keys.extend(s["session_key"] for s in sessions if s.get("session_key"))
        time.sleep(RATE_DELAY)

    imported = set(db["_imported_sessions"].distinct("session_key"))
    missing = [k for k in remote_keys if k not in imported]

    if not missing:
        log.info("No missing sessions — nothing to import.")
        return

    log.info(f"Importing {len(missing)} sessions...")
    for session_key in missing:
        log.info(f"Session {session_key}")
        import_session(db, session_key)

    log.info("Done.")
    mongo.close()


if __name__ == "__main__":
    main()
