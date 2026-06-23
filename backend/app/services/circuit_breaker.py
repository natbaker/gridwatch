"""A small async circuit breaker.

Wraps calls to an external upstream so that, once it has failed repeatedly, we
fail fast (and let callers fall back to cache / a secondary source) instead of
hammering a downed service. After a cooldown it lets a single trial request
through; success closes the circuit again.
"""

import logging
import time
from enum import Enum
from typing import Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(Exception):
    """Raised when a call is attempted while the circuit is open."""


class CircuitBreaker:
    def __init__(
        self,
        *,
        failure_threshold: int = 5,
        cooldown_seconds: float = 30.0,
        name: str = "circuit",
        time_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self._failure_threshold = failure_threshold
        self._cooldown = cooldown_seconds
        self._name = name
        self._time = time_fn
        self._failures = 0
        self._opened_at = 0.0
        self._state = CircuitState.CLOSED

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN and self._time() - self._opened_at >= self._cooldown:
            self._state = CircuitState.HALF_OPEN
        return self._state

    async def call(self, fn: Callable[[], Awaitable[T]]) -> T:
        from app import metrics

        if self.state == CircuitState.OPEN:
            metrics.record_external(self._name, "circuit_open")
            raise CircuitOpenError(self._name)
        try:
            result = await fn()
        except Exception:
            self._on_failure()
            metrics.record_external(self._name, "failure")
            raise
        self._on_success()
        metrics.record_external(self._name, "success")
        return result

    def _on_success(self) -> None:
        if self._state != CircuitState.CLOSED:
            logger.info("Circuit %s closed", self._name)
        self._failures = 0
        self._state = CircuitState.CLOSED

    def _on_failure(self) -> None:
        self._failures += 1
        if self._state == CircuitState.HALF_OPEN:
            self._trip()
        elif self._failures >= self._failure_threshold:
            self._trip()

    def _trip(self) -> None:
        self._opened_at = self._time()
        if self._state != CircuitState.OPEN:
            logger.warning("Circuit %s opened after %d failures", self._name, self._failures)
        self._state = CircuitState.OPEN
