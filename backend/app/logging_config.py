"""Logging configuration.

Wires ``GRIDWATCH_LOG_LEVEL`` (previously defined but never applied) to the root
logger, and optionally emits JSON lines (``GRIDWATCH_JSON_LOGS=true``) suitable
for ingestion by a K8s log pipeline.
"""

import json
import logging
import sys


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        for key in ("request_id", "path", "method", "status", "duration_ms"):
            if (value := getattr(record, key, None)) is not None:
                payload[key] = value
        return json.dumps(payload)


def configure_logging(level: str = "info", json_logs: bool = False) -> None:
    handler = logging.StreamHandler(sys.stdout)
    if json_logs:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
