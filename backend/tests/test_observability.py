"""Tests for logging config and the /metrics endpoint."""

import logging

from fastapi.testclient import TestClient

from app import metrics
from app.logging_config import JsonFormatter, configure_logging
from app.main import app


def test_configure_logging_sets_root_level():
    configure_logging("warning", json_logs=False)
    assert logging.getLogger().level == logging.WARNING
    configure_logging("info", json_logs=False)
    assert logging.getLogger().level == logging.INFO


def test_json_formatter_emits_json():
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "hello", None, None)
    import json

    parsed = json.loads(JsonFormatter().format(record))
    assert parsed["msg"] == "hello"
    assert parsed["level"] == "INFO"


def test_metrics_endpoint_exposes_prometheus_text():
    metrics.record_cache("hit")
    with TestClient(app) as client:
        resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "gridwatch_cache_events_total" in resp.text


def test_metrics_records_without_error_when_available():
    # Helpers must never raise regardless of prometheus availability.
    metrics.observe_request("GET", "/api/health", 200, 0.01)
    metrics.record_external("jolpica", "success")
    metrics.set_live_session(True)
    metrics.set_live_session(False)
