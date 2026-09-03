from datetime import datetime

from sqlalchemy.orm import Session

from app import llm
from app.categorize import find_category, merchant_key
from app.models import Category, MerchantOverride, PendingNudge, ReplySynonym, Transaction
from app.telegram_client import send_text

UNSURE_PHRASES = {
    "not sure", "i'm not sure", "im not sure", "idk", "i don't know", "i dont know",
    "dunno", "no idea", "skip", "unsure", "?", "pass", "no clue",
}


def _label(txn: Transaction) -> str:
    return txn.merchant_name or txn.description or "an unknown merchant"


def _money(amount) -> str:
    return f"${abs(float(amount)):,.2f}"


def _same_merchant(db: Session, txn: Transaction) -> list[Transaction]:
    key = merchant_key(txn.merchant_name, txn.description)
    return [
        t for t in db.query(Transaction).order_by(Transaction.date).all()
        if merchant_key(t.merchant_name, t.description) == key
    ]


def nudge_text(db: Session, txn: Transaction) -> str:
    """Give the user enough context to actually answer: direction, date,
    the bank's raw description, and whether this looks recurring."""
    direction = "came in" if float(txn.amount) < 0 else "went out"
    when = txn.date.strftime("%b %-d")
    lines = [f"{_money(txn.amount)} {direction} on {when} — {_label(txn)}."]

    others = [t for t in _same_merchant(db, txn) if t.id != txn.id]
    if others:
        dates = ", ".join(t.date.strftime("%b %-d") for t in others[-3:])
        amts = ", ".join(_money(t.amount) for t in others[-3:])
        lines.append(f"Looks recurring — also {dates} ({amts}).")

    lines.append("What was it? Reply in your own words (e.g. 'rent from roommate', 'refund', 'paycheque'), or 'not sure'.")
    return "\n".join(lines)


async def maybe_send_nudge(transaction: Transaction, db: Session) -> None:
    if transaction.nudge is not None:
        return
    # One question per merchant: if another transaction for the same merchant
    # already has an open nudge, the answer to that one will cover this one too.
    key = merchant_key(transaction.merchant_name, transaction.description)
    for n in db.query(PendingNudge).filter(PendingNudge.resolved_at.is_(None)).all():
        t = n.transaction
        if merchant_key(t.merchant_name, t.description) == key:
            return
    sent = await send_text(nudge_text(db, transaction))
    db.add(PendingNudge(transaction_id=transaction.id, telegram_message_id=str(sent.get("message_id", ""))))
    db.commit()


def _is_unsure(reply: str) -> bool:
    return reply.strip().lower().rstrip("?.! ") in {p.rstrip("?.! ") for p in UNSURE_PHRASES}


def _resolve_category(db: Session, reply: str) -> tuple[Category | None, bool]:
    """Returns (category, user_said_unsure)."""
    phrase = reply.strip().lower()
    if not phrase:
        return None, False
    if _is_unsure(phrase):
        return None, True
    exact = find_category(db, phrase)
    if exact:
        return exact, False
    syn = db.query(ReplySynonym).filter(ReplySynonym.phrase == phrase).first()
    if syn:
        return syn.category, False
    names = [c.name for c in db.query(Category).order_by(Category.name).all()]
    name, unsure = llm.normalize_reply(reply, names)
    if unsure:
        return None, True
    if name is None:
        return None, False
    category = find_category(db, name)
    if category:
        db.add(ReplySynonym(phrase=phrase, category_id=category.id))
        db.flush()
    return category, False


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

    txn = pending.transaction
    category, unsure = _resolve_category(db, reply_text)
    now = datetime.utcnow()

    if unsure:
        # A real answer. Leave it uncategorized, close the question, and don't
        # nag -- the next transaction from this merchant will ask again.
        for t in _same_merchant(db, txn):
            if t.nudge and t.nudge.resolved_at is None:
                t.nudge.resolved_at = now
        pending.resolved_at = now
        db.commit()
        await send_text(f"No worries — leaving {_label(txn)} uncategorized. You can fix it in the dashboard anytime.")
        return True

    if category is None:
        await send_text("Didn't quite get that — try a word or two like 'groceries', 'rent', 'refund', or say 'not sure'.")
        return False

    learn_override(db, txn, category, source="learned")
    siblings = [t for t in _same_merchant(db, txn) if t.is_ambiguous or t.id == txn.id]
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
    suffix = f" — and the {extra} other {_label(txn)} transaction{'s' if extra != 1 else ''} too" if extra > 0 else ""
    await send_text(f"Got it: {category.name}{suffix}. I won't ask about {_label(txn)} again.")
    return True
