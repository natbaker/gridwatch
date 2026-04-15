from fastapi import APIRouter

from app.config import settings
from app.models.schemas import HealthResponse, SourceStatus

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        sources=SourceStatus(),
    )
