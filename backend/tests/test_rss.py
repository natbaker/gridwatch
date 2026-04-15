import pytest

from app.services.clients.rss import RSSClient, deduplicate_articles


def test_deduplicate_removes_similar_titles():
    articles = [
        {"title": "Mercedes explains crazy problems after China", "source": "The Race"},
        {"title": "Mercedes explains 'crazy' problems after China recovery", "source": "Autosport"},
        {"title": "Hamilton's first Ferrari podium", "source": "GPFans"},
    ]
    deduped = deduplicate_articles(articles)
    assert len(deduped) == 2


def test_deduplicate_keeps_unique():
    articles = [
        {"title": "Totally different headline A", "source": "A"},
        {"title": "Totally different headline B", "source": "B"},
    ]
    deduped = deduplicate_articles(articles)
    assert len(deduped) == 2
