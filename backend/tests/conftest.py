import os
import tempfile
import pytest


@pytest.fixture(autouse=True)
def tmp_db_path(monkeypatch, tmp_path):
    """Point GRIDWATCH_DB_PATH at a temp file so tests never touch /data/."""
    db_file = tmp_path / "test.db"
    monkeypatch.setenv("GRIDWATCH_DB_PATH", str(db_file))
    # Also patch the already-imported module-level values
    import app.db as db_mod
    import app.config as cfg_mod
    from pathlib import Path
    monkeypatch.setattr(db_mod, "DB_PATH", Path(str(db_file)))
    monkeypatch.setattr(cfg_mod.settings, "db_path", str(db_file))
    yield
