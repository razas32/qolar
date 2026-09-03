from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.nudge import resolve_nudge

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/webhook")
async def telegram_webhook(payload: dict, db: Session = Depends(get_db)):
    message = payload.get("message")
    if not message or "text" not in message:
        return {"ok": True}

    await resolve_nudge(db, message["text"])
    return {"ok": True}
