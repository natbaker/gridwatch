from fastapi import APIRouter, Query, Request

router = APIRouter(prefix="/api")

CURRENT_SEASON = 2026


@router.get("/schedule")
async def get_schedule(request: Request, season: int = Query(CURRENT_SEASON)):
    facade = request.app.state.schedule_facade
    return await facade.get_schedule(season)


@router.get("/next-session")
async def get_next_session(request: Request):
    facade = request.app.state.schedule_facade
    return await facade.get_next_session()
