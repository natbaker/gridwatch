"""SQLite-backed response cache for external API calls.

Persists across container restarts. Historical/completed session data is
cached permanently; live or frequently-changing data uses short TTLs.
"""

import json
import sqlite3
import time
import logging

logger = logging.getLogger(__name__)

DEFAULT_TTL = 300  # 5 minutes for live/unknown data
PERMANENT_TTL = 0  # 0 = never expires


class ResponseCache:
    def __init__(self, db_path: str = "/data/openf1_cache.db") -> None:
        self._db_path = db_path
        self._conn: sqlite3.Connection | None = None
        self._init_db()

    def _init_db(self) -> None:
        try:
            self._conn = sqlite3.connect(self._db_path)
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS responses (
                    cache_key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    ttl REAL NOT NULL
                )
            """)
            self._conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_created ON responses(created_at)
            """)
            self._conn.commit()
            logger.info(f"Response cache initialized at {self._db_path}")
        except Exception as e:
            logger.warning(f"Could not initialize SQLite cache at {self._db_path}: {e}")
            # Fall back to in-memory
            self._conn = sqlite3.connect(":memory:")
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS responses (
                    cache_key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    ttl REAL NOT NULL
                )
            """)
            self._conn.commit()
            logger.info("Response cache falling back to in-memory SQLite")

    def get(self, key: str) -> list[dict] | None:
        if not self._conn:
            return None
        try:
            row = self._conn.execute(
                "SELECT data, created_at, ttl FROM responses WHERE cache_key = ?",
                (key,),
            ).fetchone()
            if row is None:
                return None
            data_str, created_at, ttl = row
            # ttl=0 means permanent
            if ttl > 0 and time.time() - created_at > ttl:
                return None
            return json.loads(data_str)
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
            return None

    def set(self, key: str, data: list[dict], ttl: float = DEFAULT_TTL) -> None:
        if not self._conn:
            return
        try:
            self._conn.execute(
                """INSERT OR REPLACE INTO responses (cache_key, data, created_at, ttl)
                   VALUES (?, ?, ?, ?)""",
                (key, json.dumps(data), time.time(), ttl),
            )
            self._conn.commit()
        except Exception as e:
            logger.warning(f"Cache write error: {e}")

    def stats(self) -> dict:
        if not self._conn:
            return {"total": 0, "permanent": 0, "db_path": self._db_path}
        try:
            total = self._conn.execute("SELECT COUNT(*) FROM responses").fetchone()[0]
            permanent = self._conn.execute(
                "SELECT COUNT(*) FROM responses WHERE ttl = 0"
            ).fetchone()[0]
            return {"total": total, "permanent": permanent, "db_path": self._db_path}
        except Exception:
            return {"total": 0, "permanent": 0, "db_path": self._db_path}
