from fastapi import APIRouter, Request

router = APIRouter(prefix="/api")


@router.get("/news")
async def get_news(request: Request):
    return await request.app.state.news_facade.get_news()


@router.get("/videos")
async def get_videos(request: Request):
    return await request.app.state.news_facade.get_videos()
