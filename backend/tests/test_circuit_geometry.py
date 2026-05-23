"""Tests for circuit_geometry pure functions."""

import math
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.services.circuit_geometry import (
    gps_to_svg, build_bounds_from_circuit_info,
    SVG_WIDTH, SVG_HEIGHT, SVG_PADDING,
)
from app.cache import TTLCache


# ── gps_to_svg ────────────────────────────────────────────────────────────────

def _simple_bounds(min_x=0, min_y=0, scale=1.0, off_x=20.0, off_y=20.0):
    """Minimal bounds dict with no rotation."""
    return {
        "min_x": min_x, "max_x": min_x + 100,
        "min_y": min_y, "max_y": min_y + 100,
        "scale": scale, "offset_x": off_x, "offset_y": off_y,
    }


def test_gps_to_svg_maps_origin():
    """A point at (min_x, min_y) maps to (offset_x, offset_y)."""
    bounds = _simple_bounds(min_x=10, min_y=20, scale=2.0, off_x=30.0, off_y=40.0)
    sx, sy = gps_to_svg(10, 20, bounds)
    assert sx == pytest.approx(30.0)
    assert sy == pytest.approx(40.0)


def test_gps_to_svg_scales_correctly():
    """A point offset by 1 from origin scales by the bounds scale."""
    bounds = _simple_bounds(min_x=0, min_y=0, scale=3.0, off_x=20.0, off_y=20.0)
    sx, sy = gps_to_svg(1, 2, bounds)
    assert sx == pytest.approx(20.0 + 1 * 3.0)
    assert sy == pytest.approx(20.0 + 2 * 3.0)


def test_gps_to_svg_with_rotation():
    """Rotation is applied before the scale/offset transformation."""
    bounds = {
        "min_x": -50, "max_x": 50,
        "min_y": -50, "max_y": 50,
        "scale": 1.0, "offset_x": 20.0, "offset_y": 20.0,
        "rot_cx": 0.0, "rot_cy": 0.0,
        "rot_cos": 0.0, "rot_sin": 1.0,  # 90-degree rotation
    }
    # Point (10, 0) rotated 90° around origin → (0, 10)
    sx, sy = gps_to_svg(10, 0, bounds)
    # After rotation: x=0, y=10. SVG: off_x + (0 - min_x)*scale, off_y + (10 - min_y)*scale
    assert sx == pytest.approx(20.0 + (0 - (-50)) * 1.0)
    assert sy == pytest.approx(20.0 + (10 - (-50)) * 1.0)


def test_gps_to_svg_result_is_rounded():
    """Output is rounded to 1 decimal place."""
    bounds = _simple_bounds(min_x=0, min_y=0, scale=3.0, off_x=20.0, off_y=20.0)
    sx, sy = gps_to_svg(1.333, 2.666, bounds)
    # Values should be rounded to 1dp
    assert sx == round(20.0 + 1.333 * 3.0, 1)
    assert sy == round(20.0 + 2.666 * 3.0, 1)


# ── build_bounds_from_circuit_info ────────────────────────────────────────────

def _minimal_circuit_info(n_points=10, rotation=0, sector_indexes=None):
    """Build a minimal circuit info dict with n evenly-spaced points on a unit circle."""
    angles = [2 * math.pi * i / n_points for i in range(n_points)]
    return {
        "x": [math.cos(a) * 100 for a in angles],
        "y": [math.sin(a) * 100 for a in angles],
        "rotation": rotation,
        "miniSectorsIndexes": sector_indexes or [3, 7],
        "corners": [],
    }


def test_build_bounds_track_path_has_move_and_close():
    """Output track_path starts with 'M' and ends with 'Z'."""
    info = _minimal_circuit_info()
    cache = TTLCache()
    start = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 5, 25, 15, 0, 0, tzinfo=timezone.utc)

    bounds = build_bounds_from_circuit_info(info, start, end, "test_key", cache)

    assert bounds["track_path"].startswith("M")
    assert bounds["track_path"].endswith("Z")


def test_build_bounds_sector_indices_preserved():
    """miniSectorsIndexes passes through to sector_indices unchanged."""
    info = _minimal_circuit_info(sector_indexes=[5, 12, 18])
    cache = TTLCache()
    start = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 5, 25, 15, 0, 0, tzinfo=timezone.utc)

    bounds = build_bounds_from_circuit_info(info, start, end, "test_key", cache)

    assert bounds["sector_indices"] == [5, 12, 18]


def test_build_bounds_svg_fits_within_canvas():
    """All SVG points fall within [0, SVG_WIDTH] × [0, SVG_HEIGHT]."""
    info = _minimal_circuit_info()
    cache = TTLCache()
    start = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 5, 25, 15, 0, 0, tzinfo=timezone.utc)

    bounds = build_bounds_from_circuit_info(info, start, end, "test_key", cache)

    # Parse track_path and check all coordinates
    for segment in bounds["track_path"].split():
        if segment == "Z":
            continue
        cmd = segment[0]
        coords = segment[1:].split(",")
        x, y = float(coords[0]), float(coords[1])
        assert 0 <= x <= SVG_WIDTH, f"x={x} out of bounds"
        assert 0 <= y <= SVG_HEIGHT, f"y={y} out of bounds"


def test_build_bounds_cached_by_key():
    """Second call with same bounds_key returns from cache without recomputation."""
    info = _minimal_circuit_info()
    cache = TTLCache()
    start = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 5, 25, 15, 0, 0, tzinfo=timezone.utc)

    result1 = build_bounds_from_circuit_info(info, start, end, "shared_key", cache)
    # Modify info to prove second call comes from cache
    info["rotation"] = 90
    cached = cache.get("shared_key")

    assert cached is not None
    assert cached["track_path"] == result1["track_path"]


def test_build_bounds_rotation_changes_path():
    """Non-zero rotation produces a different track_path than zero rotation."""
    info_no_rot = _minimal_circuit_info(rotation=0)
    info_rotated = _minimal_circuit_info(rotation=90)
    start = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 5, 25, 15, 0, 0, tzinfo=timezone.utc)

    bounds_no_rot = build_bounds_from_circuit_info(info_no_rot, start, end, "key_a", TTLCache())
    bounds_rotated = build_bounds_from_circuit_info(info_rotated, start, end, "key_b", TTLCache())

    assert bounds_no_rot["track_path"] != bounds_rotated["track_path"]


def test_build_bounds_corners_transformed():
    """Corners are transformed to SVG coordinates and appear in output."""
    info = _minimal_circuit_info()
    info["corners"] = [
        {"number": 1, "trackPosition": {"x": 100.0, "y": 0.0}},
        {"number": 2, "trackPosition": {"x": -100.0, "y": 0.0}},
    ]
    cache = TTLCache()
    start = datetime(2026, 5, 25, 13, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 5, 25, 15, 0, 0, tzinfo=timezone.utc)

    bounds = build_bounds_from_circuit_info(info, start, end, "test_key", cache)

    assert len(bounds["corners"]) == 2
    numbers = {c["number"] for c in bounds["corners"]}
    assert numbers == {1, 2}
    # All corner SVG coordinates should be within canvas
    for c in bounds["corners"]:
        assert 0 <= c["x"] <= SVG_WIDTH
        assert 0 <= c["y"] <= SVG_HEIGHT
