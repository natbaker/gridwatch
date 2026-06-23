import functools
import logging
import time
from typing import Any, Callable

logger = logging.getLogger(__name__)


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


def cached_async(
    *,
    ttl: float | Callable[[], float],
    key: Callable[..., str],
    stale_warning: str | None = None,
    default: Any | Callable[..., Any] | None = None,
):
    """Decorator for async facade methods that read through a TTLCache.

    The decorated method's instance must expose ``self._cache`` (a TTLCache).
    Behaviour folds in the cache pattern repeated across facades:

    - return a fresh cached value when present
    - otherwise call the method and cache its result with ``ttl``
    - on error, return a stale cached value (stamping ``warnings`` with
      ``stale_warning`` if it is a dict), else the ``default``, else re-raise

    ``key`` and ``default`` receive the method arguments (excluding ``self``).
    """

    def decorator(fn: Callable):
        @functools.wraps(fn)
        async def wrapper(self, *args, **kwargs):
            from app import metrics

            cache_key = key(*args, **kwargs)
            cached = self._cache.get(cache_key)
            if cached is not None:
                metrics.record_cache("hit")
                return cached
            metrics.record_cache("miss")
            try:
                result = await fn(self, *args, **kwargs)
            except Exception as e:  # noqa: BLE001 - graceful degradation
                logger.warning("%s failed: %s", fn.__name__, e)
                stale = self._cache.get_stale(cache_key)
                if stale is not None:
                    if stale_warning is not None and isinstance(stale, dict):
                        return {**stale, "warnings": [stale_warning]}
                    return stale
                if default is not None:
                    return default(*args, **kwargs) if callable(default) else default
                raise
            ttl_val = ttl() if callable(ttl) else ttl
            self._cache.set(cache_key, result, ttl_val)
            return result

        return wrapper

    return decorator
