import html
import logging
import re
from datetime import datetime, timezone

import feedparser
import httpx

logger = logging.getLogger(__name__)

RSS_FEEDS = {
    "Autosport": "https://www.autosport.com/rss/f1/news/",
    "RaceFans": "https://www.racefans.net/feed/",
    "GPFans": "https://www.gpfans.com/en/rss.xml",
}


def _strip_html(text: str) -> str:
    clean = re.sub(r"<[^>]+>", "", text)
    return html.unescape(clean).strip()


def _word_set(title: str) -> set[str]:
    return set(re.findall(r"\w+", title.lower()))


def deduplicate_articles(articles: list[dict]) -> list[dict]:
    seen: list[set[str]] = []
    result = []
    for article in articles:
        words = _word_set(article["title"])
        is_dup = False
        for prev in seen:
            overlap = len(words & prev) / max(len(words | prev), 1)
            if overlap > 0.6:
                is_dup = True
                break
        if not is_dup:
            seen.append(words)
            result.append(article)
    return result


class RSSClient:
    def __init__(self, http_client: httpx.AsyncClient) -> None:
        self._http = http_client

    async def fetch_all(self) -> list[dict]:
        articles = []
        for source, url in RSS_FEEDS.items():
            try:
                resp = await self._http.get(url, timeout=5.0)
                resp.raise_for_status()
                feed = feedparser.parse(resp.text)
                for entry in feed.entries[:10]:
                    published = None
                    if hasattr(entry, "published_parsed") and entry.published_parsed:
                        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                        published = dt.isoformat()
                    summary = ""
                    if hasattr(entry, "summary") and entry.summary:
                        summary = _strip_html(entry.summary)[:200]
                    articles.append({
                        "title": entry.get("title", ""),
                        "source": source,
                        "url": entry.get("link", ""),
                        "published_utc": published,
                        "summary": summary,
                    })
            except Exception:
                logger.warning(f"Failed to fetch RSS feed: {source} ({url})")
                continue

        articles = deduplicate_articles(articles)
        articles.sort(key=lambda a: a.get("published_utc") or "", reverse=True)
        return articles[:15]

    async def fetch_youtube_videos(self, channels: dict[str, str], count_per_channel: int = 3) -> list[dict]:
        """Fetch latest videos from multiple YouTube channels.

        channels: mapping of channel_name -> channel_handle (e.g. @Formula1)
        """
        all_videos = []
        for name, handle in channels.items():
            url = f"https://www.youtube.com/{handle}/videos"
            try:
                resp = await self._http.get(
                    url, timeout=10.0,
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                resp.raise_for_status()
                text = resp.text

                # Extract video data from the page's embedded JSON
                video_ids = []
                for m in re.finditer(r'"videoId":"([a-zA-Z0-9_-]{11})"', text):
                    vid_id = m.group(1)
                    if vid_id not in video_ids:
                        video_ids.append(vid_id)

                # Extract titles — they appear near videoId in the JSON
                titles: dict[str, str] = {}
                for m in re.finditer(
                    r'"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}',
                    text,
                ):
                    vid_id, title = m.group(1), m.group(2)
                    if vid_id not in titles:
                        titles[vid_id] = title

                count = 0
                for vid_id in video_ids:
                    title = titles.get(vid_id, "")
                    if not title:
                        continue
                    # Skip Shorts (titles often indicate, or we can check by URL pattern)
                    all_videos.append({
                        "title": title,
                        "url": f"https://www.youtube.com/watch?v={vid_id}",
                        "video_id": vid_id,
                        "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg",
                        "published_utc": None,
                        "channel": name,
                    })
                    count += 1
                    if count >= count_per_channel:
                        break
            except Exception:
                logger.warning(f"Failed to fetch YouTube feed for {name}")
        return all_videos
