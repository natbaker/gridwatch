from fastapi import APIRouter, Request

router = APIRouter(prefix="/api")


@router.get("/weather/{round_num}")
async def get_weather(round_num: int, request: Request):
    schedule = await request.app.state.schedule_facade.get_schedule()
    return await request.app.state.weather_facade.get_weather(round_num, schedule)
