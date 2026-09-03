from datetime import datetime

from sqlalchemy.orm import Session

from app.models import PendingNudge, Transaction
from app.telegram_client import send_nudge, confirm_category


async def maybe_send_nudge(transaction: Transaction, db: Session) -> None:
    sent = await send_nudge(transaction)
    pending = PendingNudge(
        transaction_id=transaction.id,
        telegram_message_id=str(sent["message_id"]),
    )
    db.add(pending)
    db.commit()


async def resolve_nudge(db: Session, reply_text: str) -> bool:
    """Match a Telegram reply to the most recent open nudge and apply it.

    First slice keeps this dumb: there's one user and one bot, so the
    latest unresolved nudge is assumed to be the one being answered.
    """
    pending = (
        db.query(PendingNudge)
        .filter(PendingNudge.resolved_at.is_(None))
        .order_by(PendingNudge.sent_at.desc())
        .first()
    )
    if pending is None:
        return False

    category = reply_text.strip()
    pending.transaction.category = category
    pending.resolved_at = datetime.utcnow()
    db.commit()

    await confirm_category(category)
    return True
