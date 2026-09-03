from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.nudge import resolve_nudge
from app.security import require_telegram_secret

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/webhook", dependencies=[Depends(require_telegram_secret)])
async def telegram_webhook(payload: dict, db: Session = Depends(get_db)):
    message = payload.get("message")
    if not message or "text" not in message:
        return {"ok": True}

    # The secret-token header proves Telegram sent this webhook, not that
    # you're the one who sent the message — bots are publicly messageable,
    # so anyone who finds this bot could otherwise get their reply treated
    # as an authoritative category answer.
    sender_chat_id = str(message.get("chat", {}).get("id", ""))
    if sender_chat_id != str(settings.telegram_chat_id):
        return {"ok": True}

    await resolve_nudge(db, message["text"])
    return {"ok": True}
