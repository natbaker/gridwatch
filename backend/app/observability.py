"""Error tracking via Sentry.

sentry-sdk is an optional dependency and only activates when GRIDWATCH_SENTRY_DSN
is set. Without it (or without the package installed) this is a no-op.
"""

import logging

logger = logging.getLogger(__name__)


def init_sentry(dsn: str, release: str | None = None) -> None:
    if not dsn:
        return
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover
        logger.warning("GRIDWATCH_SENTRY_DSN is set but sentry-sdk is not installed")
        return
    sentry_sdk.init(dsn=dsn, release=release, traces_sample_rate=0.1)
    logger.info("Sentry error tracking enabled")
