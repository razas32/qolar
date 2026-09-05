import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import get_db
from app.models import User
from app.telegram_client import bot_username

router = APIRouter(prefix="/me", tags=["me"])

LINK_CODE_TTL = timedelta(minutes=15)


async def _serialize(user: User) -> dict:
    code_live = (
        user.telegram_link_code
        and user.telegram_link_code_expires_at
        and user.telegram_link_code_expires_at > datetime.utcnow()
    )
    return {
        "id": str(user.id),
        "telegram_linked": bool(user.telegram_chat_id),
        "telegram_link_code": user.telegram_link_code if code_live else None,
        "bot_username": await bot_username(),
    }


@router.get("")
async def me(user: User = Depends(current_user)):
    return await _serialize(user)


@router.post("/telegram/link-code")
async def telegram_link_code(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Mint a one-time code. The dashboard turns it into a t.me deep link;
    tapping it sends `/start <code>` to the bot, which links the chat."""
    user.telegram_link_code = secrets.token_urlsafe(12)
    user.telegram_link_code_expires_at = datetime.utcnow() + LINK_CODE_TTL
    db.commit()
    return await _serialize(user)


@router.delete("/telegram")
async def telegram_unlink(user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.telegram_chat_id = None
    user.telegram_link_code = None
    user.telegram_link_code_expires_at = None
    db.commit()
    return await _serialize(user)
