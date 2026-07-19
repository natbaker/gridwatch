"""Import missing OpenF1 sessions from openf1.org into local MongoDB.

On first run against an empty MongoDB this acts as a full historical bootstrap.
On subsequent runs it only imports sessions not yet present locally.

Sessions that were previously "imported" but had no actual data (e.g. the script
ran before a race happened) will be retried automatically. Sessions that started
recently (see RECHECK_HOURS) get their max lap number re-verified against the
source even once marked imported, since ingest-realtime can die mid-session and
leave a partial capture that looks "imported" but isn't complete.

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
from datetime import datetime, timedelta, timezone

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
# The hosted API's actual limit is 30 requests/minute (confirmed via its 429 body,
# "Max 30 requests/minute") — not the 30-per-10s this delay used to assume, which
# was 6x too fast and caused frequent 429s masked as empty responses.
RATE_DELAY = 2.1

# Sessions that started this recently get their lap count re-verified against the
# source even if already marked imported: ingest-realtime can die mid-session
# (crash, connection drop) and leave a partial capture that "has some data" but
# isn't complete. Older sessions are trusted once marked imported.
RECHECK_HOURS = 48

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)


class RateLimited(Exception):
    """Raised when retries are exhausted due to sustained 429s — distinct from a
    confirmed-empty (404/204/422) response, so callers that need to trust an
    empty result as authoritative can tell the difference."""


def _get(url: str, timeout: int, strict: bool = False) -> bytes:
    """Fetch a URL, retrying on 429. On exhausted retries, returns b"" by default
    (matches confirmed-empty responses) unless ``strict``, in which case it raises
    RateLimited — for callers where treating "gave up" as "source has 0 rows"
    would be actively wrong (e.g. deciding a partial capture is "complete")."""
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
    if strict:
        raise RateLimited(url)
    return b""


def fetch_json(path: str, params: dict) -> list:
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    raw = _get(f"{SOURCE_URL}/{path}?{qs}", timeout=60)
    return json.loads(raw) if raw else []


def fetch_csv_raw(path: str, params: dict, strict: bool = False) -> list[dict]:
    import csv, io
    qs = "&".join(f"{k}={v}" for k, v in {**params, "csv": "true"}.items())
    raw = _get(f"{SOURCE_URL}/{path}?{qs}", timeout=300, strict=strict)
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


def parse_source_dt(value: str) -> datetime:
    return datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def _row_lap_number(row: dict) -> int:
    try:
        return int(row.get("lap_number") or 0)
    except (TypeError, ValueError):
        return 0


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

    sessions_by_key = {}
    for year in YEARS:
        sessions = fetch_json("sessions", {"year": year})
        for s in sessions:
            if s.get("session_key"):
                sessions_by_key[s["session_key"]] = s
        time.sleep(RATE_DELAY)
    remote_keys = list(sessions_by_key)

    tracking = {
        doc["session_key"]: doc
        for doc in db["_imported_sessions"].find({}, {"session_key": 1, "has_telemetry": 1, "has_data": 1})
    }

    now = datetime.now(timezone.utc)

    def is_recent(k: int) -> bool:
        date_start = sessions_by_key[k].get("date_start")
        if not date_start:
            return False
        try:
            return now - parse_source_dt(date_start) < timedelta(hours=RECHECK_HOURS)
        except ValueError:
            return False

    # Sessions to (re)check: not tracked, tracked without confirmed data, or recent
    # enough that a mid-session ingest-realtime crash could have left a partial import.
    needs_check = [
        k for k in remote_keys
        if k not in tracking or not tracking[k].get("has_data") or is_recent(k)
    ]

    missing_bulk = []
    for k in needs_check:
        has_local = bool(db["laps"].count_documents({"session_key": k}, limit=1))
        if not has_local:
            missing_bulk.append(k)
        elif not is_recent(k):
            # Older session with some local data — trust it as complete, since
            # ingest-realtime has had plenty of time to finish the session.
            db["_imported_sessions"].update_one(
                {"session_key": k},
                {"$set": {"has_data": True}},
                upsert=True,
            )
            log.info(f"Session {k}: already in MongoDB, marked as imported")
        else:
            # Recent session with some local data — ingest-realtime may have died
            # partway through, so verify against the source's *max lap number*
            # rather than trusting "any data at all" as "complete". Raw document
            # counts aren't comparable: ingest-realtime writes several partial-
            # update rows per lap (one per sector), while the source's bulk CSV
            # export returns roughly one row per lap — so a 9-lap local capture
            # can have far more rows than a complete 45-lap source export.
            local_max_lap = next(iter(db["laps"].aggregate([
                {"$match": {"session_key": k}},
                {"$group": {"_id": None, "m": {"$max": "$lap_number"}}},
            ])), {}).get("m") or 0
            try:
                remote_rows = fetch_csv_raw("laps", {"session_key": k}, strict=True)
            except RateLimited:
                # Don't let an exhausted-retries failure masquerade as "source has
                # 0 laps" — that would wrongly mark a partial capture as complete.
                # Leave it unmarked; the next run will re-check.
                log.warning(f"Session {k}: rate limited while verifying against source, will recheck next run")
                continue
            time.sleep(RATE_DELAY)
            remote_max_lap = max((_row_lap_number(r) for r in remote_rows), default=0)
            if remote_max_lap > local_max_lap:
                log.info(f"Session {k}: local reached lap {local_max_lap}, source reached lap {remote_max_lap} — reimporting")
                # Clear the partial capture first — these collections have no unique
                # index, so importing on top of it would just duplicate every row
                # ingest-realtime already wrote.
                for collection in BULK_ENDPOINTS + PER_DRIVER_ENDPOINTS:
                    db[collection].delete_many({"session_key": k})
                missing_bulk.append(k)
            else:
                db["_imported_sessions"].update_one(
                    {"session_key": k},
                    {"$set": {"has_data": True}},
                    upsert=True,
                )
                log.info(f"Session {k}: local lap {local_max_lap} matches or exceeds source lap {remote_max_lap}")

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
