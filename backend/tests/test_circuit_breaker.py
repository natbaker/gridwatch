"""Tests for the async CircuitBreaker."""

import pytest

from app.services.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
)


class _Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t

    def advance(self, secs: float) -> None:
        self.t += secs


async def _ok():
    return "ok"


async def _fail():
    raise RuntimeError("upstream down")


@pytest.mark.asyncio
async def test_closed_passes_through():
    cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=10)
    assert await cb.call(_ok) == "ok"
    assert cb.state == CircuitState.CLOSED


@pytest.mark.asyncio
async def test_trips_open_after_threshold_failures():
    cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=10)
    for _ in range(3):
        with pytest.raises(RuntimeError):
            await cb.call(_fail)
    assert cb.state == CircuitState.OPEN
    # Next call fast-fails without invoking the function.
    invoked = False

    async def trap():
        nonlocal invoked
        invoked = True
        return "x"

    with pytest.raises(CircuitOpenError):
        await cb.call(trap)
    assert invoked is False


@pytest.mark.asyncio
async def test_half_open_after_cooldown_then_success_closes():
    clock = _Clock()
    cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=10, time_fn=clock)
    for _ in range(2):
        with pytest.raises(RuntimeError):
            await cb.call(_fail)
    assert cb.state == CircuitState.OPEN

    clock.advance(11)
    assert cb.state == CircuitState.HALF_OPEN
    assert await cb.call(_ok) == "ok"
    assert cb.state == CircuitState.CLOSED


@pytest.mark.asyncio
async def test_half_open_failure_reopens():
    clock = _Clock()
    cb = CircuitBreaker(failure_threshold=2, cooldown_seconds=10, time_fn=clock)
    for _ in range(2):
        with pytest.raises(RuntimeError):
            await cb.call(_fail)
    clock.advance(11)
    assert cb.state == CircuitState.HALF_OPEN
    with pytest.raises(RuntimeError):
        await cb.call(_fail)
    assert cb.state == CircuitState.OPEN


@pytest.mark.asyncio
async def test_success_resets_failure_count():
    cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=10)
    with pytest.raises(RuntimeError):
        await cb.call(_fail)
    with pytest.raises(RuntimeError):
        await cb.call(_fail)
    await cb.call(_ok)  # resets
    with pytest.raises(RuntimeError):
        await cb.call(_fail)
    # Only one failure since reset → still closed.
    assert cb.state == CircuitState.CLOSED
