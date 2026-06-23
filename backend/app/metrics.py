"""Prometheus metrics.

prometheus_client is an optional dependency: if it isn't installed every helper
here is a no-op and ``available()`` returns False, so the app runs unchanged.
"""

import logging

logger = logging.getLogger(__name__)

try:
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        Counter,
        Gauge,
        Histogram,
        generate_latest,
    )

    _AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only when dep missing
    _AVAILABLE = False


if _AVAILABLE:
    _REQUEST_DURATION = Histogram(
        "gridwatch_request_duration_seconds",
        "HTTP request duration in seconds",
        ["method", "path", "status"],
    )
    _EXTERNAL_REQUESTS = Counter(
        "gridwatch_external_requests_total",
        "Calls to external upstreams by outcome",
        ["upstream", "outcome"],
    )
    _CACHE_EVENTS = Counter(
        "gridwatch_cache_events_total",
        "Read-through cache hits and misses",
        ["result"],
    )
    _LIVE_SESSION = Gauge(
        "gridwatch_live_session",
        "1 while a session is live, else 0",
    )


def available() -> bool:
    return _AVAILABLE


def observe_request(method: str, path: str, status: int, duration_s: float) -> None:
    if _AVAILABLE:
        _REQUEST_DURATION.labels(method, path, str(status)).observe(duration_s)


def record_external(upstream: str, outcome: str) -> None:
    if _AVAILABLE:
        _EXTERNAL_REQUESTS.labels(upstream, outcome).inc()


def record_cache(result: str) -> None:
    if _AVAILABLE:
        _CACHE_EVENTS.labels(result).inc()


def set_live_session(is_live: bool) -> None:
    if _AVAILABLE:
        _LIVE_SESSION.set(1 if is_live else 0)


def render() -> tuple[bytes, str]:
    if not _AVAILABLE:
        return b"", "text/plain"
    return generate_latest(), CONTENT_TYPE_LATEST
