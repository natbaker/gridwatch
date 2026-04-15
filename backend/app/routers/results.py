from fastapi import APIRouter, Query, Request

router = APIRouter(prefix="/api")

CURRENT_SEASON = 2026


@router.get("/results/latest")
async def get_latest_results(request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.results_facade
    return await facade.get_latest_results(season)


@router.get("/results/race/{round_num}")
async def get_race_results(round_num: int, request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.results_facade
    return await facade.get_race_results(round_num, season)


@router.get("/results/session/{session_key}")
async def get_session_result(session_key: int, request: Request):
    facade = request.app.state.results_facade
    return await facade.get_session_result(session_key)
