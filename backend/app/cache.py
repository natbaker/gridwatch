import time
from typing import Any


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            return None
        return value

    def get_stale(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        return entry[0]

    def set(self, key: str, value: Any, ttl: float) -> None:
        self._store[key] = (value, time.monotonic() + ttl)
        now = time.monotonic()
        self._store = {k: v for k, v in self._store.items() if v[1] > now}

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)
