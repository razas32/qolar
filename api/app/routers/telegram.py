from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.nudge import resolve_nudge
from app.security import require_telegram_secret
from app.telegram_client import send_text

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/webhook", dependencies=[Depends(require_telegram_secret)])
async def telegram_webhook(payload: dict, db: Session = Depends(get_db)):
    message = payload.get("message")
    if not message or "text" not in message:
        return {"ok": True}

    chat_id = str(message.get("chat", {}).get("id", ""))
    text: str = message["text"].strip()
    if not chat_id:
        return {"ok": True}

    # Linking: the dashboard hands the person a one-time code; they send
    # `/start <code>` (Telegram's deep link does this automatically).
    if text.startswith("/start"):
        code = text[len("/start"):].strip()
        user = None
        if code:
            user = (
                db.query(User)
                .filter(User.telegram_link_code == code)
                .filter(User.telegram_link_code_expires_at > datetime.utcnow())
                .first()
            )
        if user is None:
            await send_text(chat_id, "To connect this chat, open Qolar → Connect → Telegram and tap the link there.")
            return {"ok": True}
        # One chat per user; a chat re-linked to a new user moves.
        for other in db.query(User).filter(User.telegram_chat_id == chat_id, User.id != user.id).all():
            other.telegram_chat_id = None
        user.telegram_chat_id = chat_id
        user.telegram_link_code = None
        user.telegram_link_code_expires_at = None
        db.commit()
        await send_text(chat_id, "Connected. I'll message here when there's a transaction I can't place — reply in your own words.")
        return {"ok": True}

    user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
    if user is None:
        # Not a linked chat: bots are publicly messageable, so say nothing useful.
        await send_text(chat_id, "This chat isn't connected to a Qolar account. Open Qolar → Connect → Telegram to link it.")
        return {"ok": True}

    await resolve_nudge(db, user, text)
    return {"ok": True}
