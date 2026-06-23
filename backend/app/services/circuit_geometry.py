import math
from datetime import datetime

from app.circuits import CIRCUITS

SVG_WIDTH = 400
SVG_HEIGHT = 300
SVG_PADDING = 20

# Derived from the canonical circuit registry so there is one source of truth
# for circuit identity. Maps the Multiviewer display name → Multiviewer circuit id.
CIRCUIT_KEYS: dict[str, int] = {
    c.multiviewer_name: c.multiviewer_id for c in CIRCUITS.values()
}


def gps_to_svg(x: float, y: float, bounds: dict) -> tuple[float, float]:
    if "rot_cx" in bounds:
        dx, dy = x - bounds["rot_cx"], y - bounds["rot_cy"]
        x = bounds["rot_cx"] + dx * bounds["rot_cos"] - dy * bounds["rot_sin"]
        y = bounds["rot_cy"] + dx * bounds["rot_sin"] + dy * bounds["rot_cos"]
    sx = round(bounds["offset_x"] + (x - bounds["min_x"]) * bounds["scale"], 1)
    sy = round(bounds["offset_y"] + (y - bounds["min_y"]) * bounds["scale"], 1)
    return sx, sy


def build_bounds_from_circuit_info(info: dict, start: datetime, end: datetime, bounds_key: str, cache) -> dict:
    raw_x = info["x"]
    raw_y = info["y"]
    rotation = info.get("rotation", 0)

    cx = sum(raw_x) / len(raw_x)
    cy = sum(raw_y) / len(raw_y)
    rad = math.radians(rotation)
    cos_r, sin_r = math.cos(rad), math.sin(rad)

    pts = []
    for x, y in zip(raw_x, raw_y):
        dx, dy = x - cx, y - cy
        pts.append((cx + dx * cos_r - dy * sin_r, cy + dx * sin_r + dy * cos_r))

    all_x = [p[0] for p in pts]
    all_y = [p[1] for p in pts]
    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)
    range_x = max_x - min_x or 1
    range_y = max_y - min_y or 1

    usable_w = SVG_WIDTH - 2 * SVG_PADDING
    usable_h = SVG_HEIGHT - 2 * SVG_PADDING
    scale = min(usable_w / range_x, usable_h / range_y)
    off_x = SVG_PADDING + (usable_w - range_x * scale) / 2
    off_y = SVG_PADDING + (usable_h - range_y * scale) / 2

    svg_pts = [
        (round(off_x + (rx - min_x) * scale, 1), round(off_y + (ry - min_y) * scale, 1))
        for rx, ry in pts
    ]
    parts = [f"{'M' if i == 0 else 'L'}{sx},{sy}" for i, (sx, sy) in enumerate(svg_pts)]
    parts.append("Z")
    track_path = " ".join(parts)

    sector_indices = info.get("miniSectorsIndexes", [])

    corner_svgs = []
    for c in info.get("corners", []):
        tp = c.get("trackPosition", {})
        dx, dy = tp.get("x", 0) - cx, tp.get("y", 0) - cy
        rx = cx + dx * cos_r - dy * sin_r
        ry = cy + dx * sin_r + dy * cos_r
        corner_svgs.append({
            "number": c.get("number"),
            "x": round(off_x + (rx - min_x) * scale, 1),
            "y": round(off_y + (ry - min_y) * scale, 1),
        })

    bounds = {
        "min_x": min_x, "max_x": max_x,
        "min_y": min_y, "max_y": max_y,
        "session_start": start.isoformat(),
        "session_end": end.isoformat(),
        "track_path": track_path,
        "scale": scale,
        "offset_x": off_x,
        "offset_y": off_y,
        "rot_cx": cx, "rot_cy": cy,
        "rot_cos": cos_r, "rot_sin": sin_r,
        "sector_indices": sector_indices,
        "corners": corner_svgs,
    }
    cache.set(bounds_key, bounds, 3600)
    return bounds
