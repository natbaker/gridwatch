"""Shared session-status logic.

Centralises the "is this session live / completed / upcoming" decision that was
previously duplicated across LiveTimingFacade. Also fixes the case where OpenF1
omits ``date_end``: instead of treating the session as never-live (or, worse,
forever-live), a fallback duration bounds the live window so the session
eventually reports completed.
"""

from datetime import datetime, timedelta, timezone
from enum import Enum

# OpenF1 race weekends: practice 60m, qualifying ~60m, race up to ~2h. A 3h
# fallback comfortably covers any session whose date_end is missing.
DEFAULT_FALLBACK_DURATION_MIN = 180


class SessionStatus(str, Enum):
    LIVE = "live"
    COMPLETED = "completed"
    UPCOMING = "upcoming"


def _to_utc(value: str | datetime | None) -> datetime | None:
    if value is None or value == "":
        return None
    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def session_status(
    date_start: str | datetime | None,
    date_end: str | datetime | None = None,
    now: datetime | None = None,
    *,
    fallback_duration_min: int = DEFAULT_FALLBACK_DURATION_MIN,
) -> SessionStatus:
    """Classify a session as LIVE, COMPLETED or UPCOMING.

    Accepts ISO strings (OpenF1) or native datetimes (pymongo BSON). When
    ``date_end`` is missing it is inferred as ``date_start + fallback_duration``.
    """
    now = now or datetime.now(timezone.utc)
    start = _to_utc(date_start)
    if start is None:
        return SessionStatus.UPCOMING
    end = _to_utc(date_end) or start + timedelta(minutes=fallback_duration_min)
    if now < start:
        return SessionStatus.UPCOMING
    if now > end:
        return SessionStatus.COMPLETED
    return SessionStatus.LIVE


def is_live(
    date_start: str | datetime | None,
    date_end: str | datetime | None = None,
    now: datetime | None = None,
    *,
    fallback_duration_min: int = DEFAULT_FALLBACK_DURATION_MIN,
) -> bool:
    return (
        session_status(date_start, date_end, now, fallback_duration_min=fallback_duration_min)
        == SessionStatus.LIVE
    )
