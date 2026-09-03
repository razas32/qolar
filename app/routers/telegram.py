from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.nudge import resolve_nudge
from app.security import require_telegram_secret

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/webhook", dependencies=[Depends(require_telegram_secret)])
async def telegram_webhook(payload: dict, db: Session = Depends(get_db)):
    message = payload.get("message")
    if not message or "text" not in message:
        return {"ok": True}

    await resolve_nudge(db, message["text"])
    return {"ok": True}
