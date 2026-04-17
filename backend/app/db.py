"""SQLite database for cached F1 telemetry, positions, and radio data."""

import sqlite3
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

from app.config import settings
DB_PATH = Path(settings.db_path)


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db() -> None:
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS car_data (
            session_key INTEGER NOT NULL,
            driver_number INTEGER NOT NULL,
            t REAL NOT NULL,
            speed INTEGER,
            throttle INTEGER,
            brake INTEGER,
            rpm INTEGER,
            gear INTEGER,
            drs INTEGER,
            PRIMARY KEY (session_key, driver_number, t)
        );

        CREATE TABLE IF NOT EXISTS team_radio (
            session_key INTEGER NOT NULL,
            driver_number INTEGER NOT NULL,
            t REAL NOT NULL,
            recording_url TEXT NOT NULL,
            PRIMARY KEY (session_key, driver_number, t)
        );

        CREATE TABLE IF NOT EXISTS locations (
            session_key INTEGER NOT NULL,
            driver_number INTEGER NOT NULL,
            t REAL NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            PRIMARY KEY (session_key, driver_number, t)
        );

        CREATE TABLE IF NOT EXISTS downloaded_sessions (
            session_key INTEGER PRIMARY KEY,
            circuit TEXT,
            session_name TEXT,
            data_start TEXT,
            downloaded_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_car_data_session_driver
            ON car_data(session_key, driver_number, t);
        CREATE INDEX IF NOT EXISTS idx_locations_session
            ON locations(session_key, t);
        CREATE INDEX IF NOT EXISTS idx_radio_session
            ON team_radio(session_key, t);
    """)
    conn.commit()
    conn.close()


def is_session_downloaded(session_key: int) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT 1 FROM downloaded_sessions WHERE session_key = ?",
        (session_key,),
    ).fetchone()
    conn.close()
    return row is not None


def get_session_data_start(session_key: int) -> str | None:
    """Get the data_start timestamp for a downloaded session."""
    conn = get_connection()
    row = conn.execute(
        "SELECT data_start FROM downloaded_sessions WHERE session_key = ?",
        (session_key,),
    ).fetchone()
    conn.close()
    return row["data_start"] if row else None


def get_downloaded_session_info(session_key: int) -> dict | None:
    """Get full info for a downloaded session."""
    conn = get_connection()
    row = conn.execute(
        "SELECT session_key, circuit, session_name, data_start FROM downloaded_sessions WHERE session_key = ?",
        (session_key,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_car_data(session_key: int, driver_number: int, t_start: float, t_end: float) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT t, speed, throttle, brake, rpm, gear, drs
           FROM car_data
           WHERE session_key = ? AND driver_number = ? AND t >= ? AND t < ?
           ORDER BY t""",
        (session_key, driver_number, t_start, t_end),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_radio_events(session_key: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT driver_number, t, recording_url
           FROM team_radio
           WHERE session_key = ?
           ORDER BY t""",
        (session_key,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_downloaded_sessions() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT session_key, circuit, session_name, data_start, downloaded_at
           FROM downloaded_sessions ORDER BY downloaded_at DESC""",
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_session_stats(session_key: int) -> dict:
    conn = get_connection()
    car = conn.execute("SELECT COUNT(*) as n FROM car_data WHERE session_key = ?", (session_key,)).fetchone()
    loc = conn.execute("SELECT COUNT(*) as n FROM locations WHERE session_key = ?", (session_key,)).fetchone()
    radio = conn.execute("SELECT COUNT(*) as n FROM team_radio WHERE session_key = ?", (session_key,)).fetchone()
    conn.close()
    return {"car_data": car["n"], "locations": loc["n"], "radio": radio["n"]}


def delete_session_data(session_key: int) -> None:
    conn = get_connection()
    for table in ("car_data", "team_radio", "locations", "downloaded_sessions"):
        conn.execute(f"DELETE FROM {table} WHERE session_key = ?", (session_key,))
    conn.commit()
    conn.close()


def get_locations(session_key: int, t_start: float, t_end: float) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT driver_number, t, x, y
           FROM locations
           WHERE session_key = ? AND t >= ? AND t < ?
           ORDER BY t""",
        (session_key, t_start, t_end),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_driver_locations(session_key: int, driver_number: int, t_start: float, t_end: float) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT t, x, y
           FROM locations
           WHERE session_key = ? AND driver_number = ? AND t >= ? AND t < ?
           ORDER BY t""",
        (session_key, driver_number, t_start, t_end),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
