"""Admin endpoints for managing session data downloads."""

import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.db import (
    get_downloaded_sessions,
    get_session_stats,
    is_session_downloaded,
    delete_session_data,
)
from app.cli import download_session

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="Admin not configured")
    if credentials is None or credentials.credentials != settings.admin_token:
        raise HTTPException(status_code=401, detail="Unauthorized")


router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])

# Track download state: session_key -> {status, message, percent}
_downloads: dict[int, dict] = {}
_queue: list[tuple[int, bool]] = []  # (session_key, force)
_worker_running = False


async def _process_queue():
    """Process queued downloads one at a time."""
    global _worker_running
    _worker_running = True
    try:
        while _queue:
            session_key, force = _queue.pop(0)
            _downloads[session_key] = {"status": "starting", "message": "Starting...", "percent": 0}

            def on_progress(message: str, pct: float, sk=session_key):
                if pct < 0:
                    _downloads[sk] = {"status": "error", "message": message, "percent": 0}
                elif pct >= 100:
                    _downloads[sk] = {"status": "done", "message": message, "percent": 100}
                else:
                    _downloads[sk] = {"status": "downloading", "message": message, "percent": pct}

            try:
                await download_session(session_key, force=force, on_progress=on_progress)
            except Exception as e:
                logger.error(f"Download failed for {session_key}: {e}")
                _downloads[session_key] = {"status": "error", "message": str(e), "percent": 0}
    finally:
        _worker_running = False


@router.get("/available-sessions")
async def available_sessions(year: int = Query(None)):
    """List sessions from OpenF1, optionally filtered by year."""
    params = {}
    if year:
        params["year"] = str(year)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get("https://api.openf1.org/v1/sessions", params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch available sessions: {e}")
        return {"sessions": [], "error": str(e)}

    downloaded = {s["session_key"] for s in get_downloaded_sessions()}
    sessions = []
    for s in data:
        sk = s.get("session_key")
        if not sk:
            continue
        sessions.append({
            "session_key": sk,
            "circuit": s.get("circuit_short_name", ""),
            "country": s.get("country_name", ""),
            "session_name": s.get("session_name", ""),
            "date_start": s.get("date_start", ""),
            "year": s.get("year"),
            "downloaded": sk in downloaded,
        })
    sessions.sort(key=lambda x: x["date_start"], reverse=True)
    return {"sessions": sessions}


@router.get("/sessions")
async def list_sessions():
    """List all downloaded sessions with their stats."""
    sessions = get_downloaded_sessions()
    result = []
    for s in sessions:
        stats = get_session_stats(s["session_key"])
        result.append({**s, **stats})
    return {"sessions": result}


@router.post("/download")
async def start_download(request: Request, session_key: int = Query(...), force: bool = Query(False)):
    """Queue a download for a session."""
    existing = _downloads.get(session_key)
    if existing and existing.get("status") in ("starting", "downloading"):
        return JSONResponse(
            {"error": "Download already in progress", "status": existing},
            status_code=409,
        )

    # Check if already in queue
    if any(sk == session_key for sk, _ in _queue):
        return JSONResponse(
            {"error": "Already queued", "status": _downloads.get(session_key, {})},
            status_code=409,
        )

    _downloads[session_key] = {"status": "queued", "message": "Queued", "percent": 0}
    _queue.append((session_key, force))

    if not _worker_running:
        asyncio.create_task(_process_queue())

    return {"message": "Download queued", "session_key": session_key}


@router.get("/download-status")
async def download_status(session_key: int = Query(...)):
    """Check download progress for a session."""
    if session_key in _downloads:
        return _downloads[session_key]
    if is_session_downloaded(session_key):
        return {"status": "done", "message": "Already downloaded", "percent": 100}
    return {"status": "idle", "message": "Not downloaded", "percent": 0}


@router.get("/queue")
async def get_queue():
    """Get the current download queue."""
    return {"queue": [sk for sk, _ in _queue]}


@router.delete("/sessions")
async def remove_session(session_key: int = Query(...)):
    """Delete all cached data for a session."""
    delete_session_data(session_key)
    _downloads.pop(session_key, None)
    return {"message": f"Session {session_key} deleted"}
