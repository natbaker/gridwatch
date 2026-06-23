import logging
from datetime import datetime, timezone

from app.cache import TTLCache, cached_async
from app.config import settings
from app.services.clients.rss import RSSClient

logger = logging.getLogger(__name__)


class NewsFacade:
    def __init__(self, rss: RSSClient, cache: TTLCache) -> None:
        self._rss = rss
        self._cache = cache

    @cached_async(
        ttl=settings.cache_ttl_news,
        key=lambda: "news",
        stale_warning="Using cached news",
        default=lambda: {
            "articles": [],
            "last_updated_utc": datetime.now(timezone.utc).isoformat(),
            "warnings": [],
        },
    )
    async def get_news(self) -> dict:
        articles = await self._rss.fetch_all()
        return {
            "articles": articles,
            "last_updated_utc": datetime.now(timezone.utc).isoformat(),
            "warnings": [],
        }

    @cached_async(
        ttl=900,  # 15 min cache
        key=lambda: "videos",
        default=lambda: {"videos": [], "warnings": []},
    )
    async def get_videos(self) -> dict:
        channels = {
            "Formula 1": "@Formula1",
        }
        videos = await self._rss.fetch_youtube_videos(channels, 3)
        return {"videos": videos, "warnings": []}
