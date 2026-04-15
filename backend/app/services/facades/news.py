import logging
from datetime import datetime, timezone

from app.cache import TTLCache
from app.config import settings
from app.services.clients.rss import RSSClient

logger = logging.getLogger(__name__)


class NewsFacade:
    def __init__(self, rss: RSSClient, cache: TTLCache) -> None:
        self._rss = rss
        self._cache = cache

    async def get_news(self) -> dict:
        cached = self._cache.get("news")
        if cached:
            return cached

        try:
            articles = await self._rss.fetch_all()
        except Exception as e:
            logger.warning(f"News fetch failed: {e}")
            stale = self._cache.get_stale("news")
            if stale:
                stale["warnings"] = ["Using cached news"]
                return stale
            articles = []

        result = {
            "articles": articles,
            "last_updated_utc": datetime.now(timezone.utc).isoformat(),
            "warnings": [],
        }
        self._cache.set("news", result, settings.cache_ttl_news)
        return result

    async def get_videos(self) -> dict:
        cached = self._cache.get("videos")
        if cached:
            return cached

        channels = {
            "Formula 1": "@Formula1",
        }
        try:
            videos = await self._rss.fetch_youtube_videos(channels, 3)
        except Exception as e:
            logger.warning(f"Video fetch failed: {e}")
            stale = self._cache.get_stale("videos")
            if stale:
                return stale
            videos = []

        result = {"videos": videos, "warnings": []}
        self._cache.set("videos", result, 900)  # 15 min cache
        return result
