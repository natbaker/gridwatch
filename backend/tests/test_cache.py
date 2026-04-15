import time

import pytest

from app.cache import TTLCache


def test_set_and_get():
    cache = TTLCache()
    cache.set("key", "value", ttl=60)
    assert cache.get("key") == "value"


def test_get_missing_key():
    cache = TTLCache()
    assert cache.get("missing") is None


def test_expired_entry_returns_none():
    cache = TTLCache()
    cache.set("key", "value", ttl=0.01)
    time.sleep(0.02)
    assert cache.get("key") is None


def test_invalidate():
    cache = TTLCache()
    cache.set("key", "value", ttl=60)
    cache.invalidate("key")
    assert cache.get("key") is None


def test_get_stale_returns_expired_value():
    cache = TTLCache()
    cache.set("key", "value", ttl=0.01)
    time.sleep(0.02)
    assert cache.get_stale("key") == "value"
