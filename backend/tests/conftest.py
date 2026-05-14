import pytest


@pytest.fixture(autouse=True)
def patch_openf1_settings(monkeypatch):
    """Ensure tests don't inherit production OpenF1 URLs from the environment."""
    monkeypatch.setenv("GRIDWATCH_OPENF1_BASE_URL", "http://test-openf1")
    monkeypatch.setenv("GRIDWATCH_OPENF1_FALLBACK_URL", "")
    yield
