from datetime import datetime

from sqlalchemy.orm import Session

from app import llm
from app.categorize import find_category, merchant_key
from app.models import Category, MerchantOverride, PendingNudge, ReplySynonym, Transaction
from app.telegram_client import send_nudge, confirm_category, send_text


async def maybe_send_nudge(transaction: Transaction, db: Session) -> None:
    if transaction.nudge is not None:
        return
    sent = await send_nudge(transaction)
    db.add(PendingNudge(transaction_id=transaction.id, telegram_message_id=str(sent["message_id"])))
    db.commit()


def _resolve_category(db: Session, reply: str) -> Category | None:
    phrase = reply.strip().lower()
    if not phrase:
        return None
    # Free paths first: exact category name, then a phrase we've resolved before.
    exact = find_category(db, phrase)
    if exact:
        return exact
    syn = db.query(ReplySynonym).filter(ReplySynonym.phrase == phrase).first()
    if syn:
        return syn.category
    # Paid path: one LLM call, then remember the phrase.
    names = [c.name for c in db.query(Category).order_by(Category.name).all()]
    name = llm.normalize_reply(reply, names)
    if name is None:
        return None
    category = find_category(db, name)
    if category:
        db.add(ReplySynonym(phrase=phrase, category_id=category.id))
        db.flush()
    return category


def learn_override(db: Session, txn: Transaction, category: Category, source: str) -> None:
    """Remember this merchant -> category. `user` outranks `learned`."""
    key = merchant_key(txn.merchant_name, txn.description)
    if not key:
        return
    override = db.query(MerchantOverride).filter(MerchantOverride.merchant_key == key).first()
    if override is None:
        db.add(MerchantOverride(merchant_key=key, category_id=category.id, always_ask=False, source=source))
    elif source == "user" or override.source != "user":
        override.category_id = category.id
        override.always_ask = False
        override.source = source
    db.flush()


async def resolve_nudge(db: Session, reply_text: str) -> bool:
    """Match a Telegram reply to the most recent open nudge and apply it.
    Single user for now, so the latest unresolved nudge is the one answered."""
    pending = (
        db.query(PendingNudge)
        .filter(PendingNudge.resolved_at.is_(None))
        .order_by(PendingNudge.sent_at.desc())
        .first()
    )
    if pending is None:
        return False

    category = _resolve_category(db, reply_text)
    if category is None:
        names = ", ".join(c.name for c in db.query(Category).order_by(Category.name).all())
        await send_text(f"Didn't catch that. Reply with one of: {names}")
        return False

    txn = pending.transaction
    learn_override(db, txn, category, source="learned")

    # Apply to this transaction AND every other open question for the same
    # merchant -- one answer should never leave three identical asks pending.
    key = merchant_key(txn.merchant_name, txn.description)
    now = datetime.utcnow()
    siblings = [t for t in db.query(Transaction).filter(Transaction.is_ambiguous.is_(True)).all()
                if merchant_key(t.merchant_name, t.description) == key]
    for t in siblings:
        t.category_id = category.id
        t.category_source = "nudge"
        t.category = category.name
        t.is_ambiguous = False
        if t.nudge and t.nudge.resolved_at is None:
            t.nudge.resolved_at = now
    pending.resolved_at = now
    db.commit()

    extra = len(siblings) - 1
    suffix = f" (and {extra} other {txn.merchant_name or txn.description} transaction{'s' if extra != 1 else ''})" if extra > 0 else ""
    await confirm_category(f"{category.name}{suffix}")
    return True
