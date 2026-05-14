from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

_bearer = HTTPBearer(auto_error=False)


def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="Admin not configured")
    if credentials is None or credentials.credentials != settings.admin_token:
        raise HTTPException(status_code=401, detail="Unauthorized")


router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


@router.get("/status")
async def status():
    return {"ok": True}
