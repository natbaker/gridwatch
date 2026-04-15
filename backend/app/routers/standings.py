from fastapi import APIRouter, Query, Request

router = APIRouter(prefix="/api")

CURRENT_SEASON = 2026


@router.get("/standings/drivers")
async def get_driver_standings(request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.standings_facade
    return await facade.get_driver_standings(season)


@router.get("/standings/constructors")
async def get_constructor_standings(request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.standings_facade
    return await facade.get_constructor_standings(season)
