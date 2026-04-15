from fastapi import APIRouter, Query, Request

router = APIRouter(prefix="/api")

CURRENT_SEASON = 2026


@router.get("/analytics/progression")
async def get_season_progression(request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.analytics_facade
    return await facade.get_season_progression(season)


@router.get("/analytics/driver/{driver_code}")
async def get_driver_stats(driver_code: str, request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.analytics_facade
    return await facade.get_driver_stats(driver_code, season)


@router.get("/analytics/predictions")
async def get_predictions(request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.analytics_facade
    return await facade.get_predictions(season)
