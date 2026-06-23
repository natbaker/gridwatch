"""Tests for the shared session-status helper."""

from datetime import datetime, timedelta, timezone

from app.services.session_status import SessionStatus, session_status, is_live

NOW = datetime(2026, 6, 21, 14, 0, tzinfo=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def test_live_when_now_between_start_and_end():
    start = _iso(NOW - timedelta(minutes=30))
    end = _iso(NOW + timedelta(minutes=30))
    assert session_status(start, end, now=NOW) == SessionStatus.LIVE
    assert is_live(start, end, now=NOW) is True


def test_completed_when_now_after_end():
    start = _iso(NOW - timedelta(hours=3))
    end = _iso(NOW - timedelta(hours=1))
    assert session_status(start, end, now=NOW) == SessionStatus.COMPLETED


def test_upcoming_when_now_before_start():
    start = _iso(NOW + timedelta(hours=1))
    end = _iso(NOW + timedelta(hours=3))
    assert session_status(start, end, now=NOW) == SessionStatus.UPCOMING


def test_missing_end_uses_fallback_duration_for_live():
    # Started 30 min ago, no end → still live within fallback window.
    start = _iso(NOW - timedelta(minutes=30))
    assert session_status(start, None, now=NOW) == SessionStatus.LIVE


def test_missing_end_becomes_completed_after_fallback_window():
    # Started well beyond the fallback window with no end → completed,
    # not stuck "live" forever.
    start = _iso(NOW - timedelta(hours=10))
    assert session_status(start, None, now=NOW) == SessionStatus.COMPLETED


def test_accepts_naive_and_native_datetimes():
    start = NOW - timedelta(minutes=10)  # naive-ish aware datetime object
    end = NOW + timedelta(minutes=10)
    assert session_status(start, end, now=NOW) == SessionStatus.LIVE


def test_missing_start_is_upcoming():
    assert session_status("", None, now=NOW) == SessionStatus.UPCOMING
