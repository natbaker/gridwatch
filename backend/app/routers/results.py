from fastapi import APIRouter, Query, Request

router = APIRouter(prefix="/api")

CURRENT_SEASON = 2026


@router.get("/results/latest")
async def get_latest_results(request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.results_facade
    return await facade.get_latest_results(season)


@router.get("/results/race/{round_num}")
async def get_race_results(round_num: int, request: Request, season: int = Query(CURRENT_SEASON), race_date: str | None = Query(None)):
    facade = request.app.state.results_facade
    return await facade.get_race_results(round_num, season, race_date)


@router.get("/results/qualifying/{round_num}")
async def get_qualifying_results(round_num: int, request: Request, season: int = Query(CURRENT_SEASON), race_date: str | None = Query(None)):
    facade = request.app.state.results_facade
    return await facade.get_qualifying_results(round_num, season, race_date)
