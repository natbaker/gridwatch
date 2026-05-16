from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(prefix="/api")


@router.get("/live-timing")
async def get_live_timing(request: Request, session_key: int | None = Query(None)):
    facade = request.app.state.live_timing_facade
    return await facade.get_timing_data(session_key)


@router.get("/live-timing/session")
async def get_live_session(request: Request):
    facade = request.app.state.live_timing_facade
    result = await facade.get_live_session()
    return result or {"session_key": None, "is_live": False}


@router.get("/live-timing/locations")
async def get_car_locations(request: Request, session_key: int | None = Query(None)):
    facade = request.app.state.live_timing_facade
    return await facade.get_car_locations(session_key)


@router.get("/live-timing/session-key")
async def get_session_key_for_round(
    request: Request,
    year: int = Query(...),
    round: int = Query(...),
    session_type: str = Query("Race"),
    race_date: str | None = Query(None),
):
    facade = request.app.state.live_timing_facade
    result = await facade.get_session_key_for_round(year, round, session_type, race_date)
    return result


@router.get("/live-timing/round-sessions")
async def get_round_sessions(
    request: Request,
    year: int = Query(...),
    round: int = Query(...),
    race_date: str | None = Query(None),
):
    facade = request.app.state.live_timing_facade
    return await facade.get_round_sessions(year, round, race_date)


@router.get("/live-timing/replay/info")
async def get_replay_info(request: Request, session_key: int = Query(...)):
    facade = request.app.state.live_timing_facade
    return await facade.get_replay_info(session_key)


@router.get("/live-timing/replay/positions")
async def get_replay_positions(
    request: Request,
    session_key: int = Query(...),
    from_time: str = Query(..., alias="from"),
    seconds: int = Query(30),
):
    facade = request.app.state.live_timing_facade
    return await facade.get_replay_positions(session_key, from_time, seconds)


@router.get("/live-timing/replay/telemetry")
async def get_car_telemetry(
    request: Request,
    session_key: int = Query(...),
    driver_number: int = Query(...),
    from_time: str = Query(..., alias="from"),
    seconds: int = Query(30),
):
    facade = request.app.state.live_timing_facade
    return await facade.get_car_telemetry(session_key, driver_number, from_time, seconds)


@router.post("/sessions/{session_key}/import-telemetry")
async def trigger_import_telemetry(request: Request, session_key: int):
    from app.config import settings
    from app.services import telemetry_import
    if not settings.mongo_connection_string:
        raise HTTPException(status_code=503, detail="MongoDB not configured (set GRIDWATCH_MONGO_CONNECTION_STRING)")
    return await telemetry_import.start_import(session_key, settings.mongo_connection_string, settings.openf1_db_name)


@router.get("/sessions/{session_key}/import-status")
async def get_import_status(session_key: int):
    from app.services import telemetry_import
    return telemetry_import.get_status(session_key)


@router.get("/sessions-status")
async def get_sessions_data_status(request: Request, year: int = Query(...)):
    facade = request.app.state.live_timing_facade
    return await facade.get_sessions_data_status(year)


@router.get("/sessions/{session_key}/lap-telemetry")
async def get_lap_telemetry(
    request: Request,
    session_key: int,
    driver_number: int = Query(...),
    lap: str = Query("fastest"),
):
    facade = request.app.state.live_timing_facade
    result = await facade.get_lap_telemetry(session_key, driver_number, lap)
    if "error" in result:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": result["error"]}, status_code=404)
    return result
