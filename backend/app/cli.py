"""CLI tool to download F1 session data from OpenF1 into local SQLite."""

import argparse
import asyncio
import csv
import io
import logging
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx

from app.db import get_connection, init_db, is_session_downloaded

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BASE_URL = "https://api.openf1.org/v1"
RATE_DELAY = 2.5  # seconds between API calls to avoid throttling


async def fetch_json(client: httpx.AsyncClient, path: str, params: dict | None = None) -> list | dict:
    """Fetch JSON from OpenF1 with retry on rate limit."""
    for attempt in range(5):
        resp = await client.get(path, params=params)
        if resp.status_code == 429:
            wait = (attempt + 1) * 5
            logger.warning(f"Rate limited, waiting {wait}s...")
            await asyncio.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and "detail" in data:
            return []
        return data
    raise RuntimeError(f"Failed after 5 retries: {path}")


async def fetch_csv(client: httpx.AsyncClient, path: str, params: dict | None = None) -> list[dict]:
    """Fetch CSV from OpenF1 with retry on rate limit."""
    if params is None:
        params = {}
    params["csv"] = "true"
    for attempt in range(5):
        resp = await client.get(path, params=params)
        if resp.status_code == 429:
            wait = (attempt + 1) * 5
            logger.warning(f"Rate limited, waiting {wait}s...")
            await asyncio.sleep(wait)
            continue
        resp.raise_for_status()
        text = resp.text
        if not text.strip():
            return []
        reader = csv.DictReader(io.StringIO(text))
        return list(reader)
    raise RuntimeError(f"Failed after 5 retries: {path}")


def _noop_progress(msg: str, pct: float) -> None:
    pass


def _parse_dt(date_str: str) -> datetime:
    dt = datetime.fromisoformat(date_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _safe_int(val, default=0) -> int:
    if val is None or val == "":
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _safe_float(val, default=0.0) -> float:
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


async def download_session(session_key: int, force: bool = False, on_progress=None) -> None:
    if on_progress is None:
        on_progress = _noop_progress
    if not force and is_session_downloaded(session_key):
        logger.info(f"Session {session_key} already downloaded. Use --force to re-download.")
        on_progress("Already downloaded", 100)
        return

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=60.0) as client:
        # Get session info
        on_progress("Fetching session info...", 0)
        logger.info(f"Fetching session info for {session_key}...")
        sessions = await fetch_json(client, "/sessions", {"session_key": str(session_key)})
        if not sessions:
            logger.error(f"Session {session_key} not found")
            on_progress("Session not found", -1)
            return
        session = sessions[0]
        circuit = session.get("circuit_short_name", "Unknown")
        session_name = session.get("session_name", "Unknown")
        date_start = session.get("date_start", "")
        date_end = session.get("date_end", "")
        logger.info(f"Session: {circuit} {session_name}")
        logger.info(f"  Start: {date_start}")
        logger.info(f"  End:   {date_end}")

        if not date_start:
            logger.error("No date_start found")
            on_progress("No date_start found", -1)
            return

        start_dt = _parse_dt(date_start)

        # Get drivers
        await asyncio.sleep(RATE_DELAY)
        logger.info("Fetching drivers...")
        drivers = await fetch_json(client, "/drivers", {
            "session_key": str(session_key),
        })
        driver_numbers = sorted(set(d["driver_number"] for d in drivers if "driver_number" in d))
        logger.info(f"  Found {len(driver_numbers)} drivers: {driver_numbers}")

        conn = get_connection()

        # Clear old data if re-downloading
        if force:
            for table in ("car_data", "team_radio", "locations", "downloaded_sessions"):
                conn.execute(f"DELETE FROM {table} WHERE session_key = ?", (session_key,))
            conn.commit()

        # Download car_data per driver (CSV, speed>0)
        logger.info("Downloading car telemetry (CSV, speed>0)...")
        total_car = 0
        n_drivers = len(driver_numbers)
        for i, dn in enumerate(driver_numbers):
            await asyncio.sleep(RATE_DELAY)
            pct = round((i / n_drivers) * 40 + 5)  # 5-45%
            on_progress(f"Telemetry: driver {dn} ({i+1}/{n_drivers})", pct)
            logger.info(f"  Driver {dn} ({i+1}/{n_drivers})...")
            data = await fetch_csv(client, "/car_data", {
                "session_key": str(session_key),
                "driver_number": str(dn),
                "speed>": "0",
            })
            if not data:
                logger.info(f"    No data")
                continue

            rows = []
            for entry in data:
                date = entry.get("date", "")
                if not date:
                    continue
                entry_dt = _parse_dt(date)
                t = (entry_dt - start_dt).total_seconds()
                rows.append((
                    session_key, dn, round(t, 2),
                    _safe_int(entry.get("speed")),
                    _safe_int(entry.get("throttle")),
                    _safe_int(entry.get("brake")),
                    _safe_int(entry.get("rpm")),
                    _safe_int(entry.get("n_gear")),
                    _safe_int(entry.get("drs")),
                ))
            if rows:
                conn.executemany(
                    "INSERT OR REPLACE INTO car_data VALUES (?,?,?,?,?,?,?,?,?)",
                    rows,
                )
                conn.commit()
                total_car += len(rows)
                logger.info(f"    {len(rows)} samples")

        logger.info(f"  Total car_data: {total_car} samples")

        # Download team_radio (JSON — small payload, no CSV benefit)
        await asyncio.sleep(RATE_DELAY)
        on_progress("Downloading team radio...", 47)
        logger.info("Downloading team radio...")
        radio_rows = []
        try:
            radio = await fetch_json(client, "/team_radio", {
                "session_key": str(session_key),
            })
            for r in radio:
                date = r.get("date")
                dn = r.get("driver_number")
                url = r.get("recording_url")
                if not date or not dn or not url:
                    continue
                entry_dt = _parse_dt(date)
                t = (entry_dt - start_dt).total_seconds()
                radio_rows.append((session_key, dn, round(t, 1), url))
            if radio_rows:
                conn.executemany(
                    "INSERT OR REPLACE INTO team_radio VALUES (?,?,?,?)",
                    radio_rows,
                )
                conn.commit()
        except Exception as e:
            logger.warning(f"  Radio unavailable: {e}")
        logger.info(f"  {len(radio_rows)} radio clips")

        # Download locations per driver (CSV)
        logger.info("Downloading car locations (CSV)...")
        total_loc = 0
        for i, dn in enumerate(driver_numbers):
            await asyncio.sleep(RATE_DELAY)
            pct = round((i / n_drivers) * 45 + 50)  # 50-95%
            on_progress(f"Locations: driver {dn} ({i+1}/{n_drivers})", pct)
            logger.info(f"  Driver {dn} ({i+1}/{n_drivers})...")
            data = await fetch_csv(client, "/location", {
                "session_key": str(session_key),
                "driver_number": str(dn),
            })
            if not data:
                logger.info(f"    No data")
                continue

            rows = []
            for entry in data:
                date = entry.get("date", "")
                x = entry.get("x")
                y = entry.get("y")
                if not date or x is None or x == "" or y is None or y == "":
                    continue
                entry_dt = _parse_dt(date)
                t = (entry_dt - start_dt).total_seconds()
                rows.append((session_key, dn, round(t, 2), _safe_float(x), _safe_float(y)))
            if rows:
                conn.executemany(
                    "INSERT OR REPLACE INTO locations VALUES (?,?,?,?,?)",
                    rows,
                )
                conn.commit()
                total_loc += len(rows)
                logger.info(f"    {len(rows)} positions")

        logger.info(f"  Total locations: {total_loc} positions")

        # Mark session as downloaded
        conn.execute(
            "INSERT OR REPLACE INTO downloaded_sessions VALUES (?,?,?,?,datetime('now'))",
            (session_key, circuit, session_name, date_start),
        )
        conn.commit()
        conn.close()

        on_progress("Done", 100)
        logger.info(f"Done! Session {session_key} ({circuit} {session_name}) downloaded.")
        logger.info(f"  Car telemetry: {total_car} samples")
        logger.info(f"  Team radio: {len(radio_rows)} clips")
        logger.info(f"  Locations: {total_loc} positions")


def main():
    parser = argparse.ArgumentParser(description="Download F1 session data from OpenF1")
    parser.add_argument("session_key", type=int, help="OpenF1 session key")
    parser.add_argument("--force", action="store_true", help="Re-download even if already cached")
    args = parser.parse_args()

    init_db()
    asyncio.run(download_session(args.session_key, force=args.force))


if __name__ == "__main__":
    main()
