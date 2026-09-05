"""Match transfers between one user's own accounts.

A credit-card autopay, an e-transfer to savings, etc. shows up twice: money
out of one account and the same amount into another on the same day. The
merchant name is useless for this ("PREAUTHORIZED PAYMENT") but the shape
is unmistakable. Both sides become Transfers so neither counts as spending
or income.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.categorize import find_category
from app.models import Item, Transaction, User

WINDOW_DAYS = 2
SOURCE = "matched"


def match_transfers(db: Session, user: User) -> int:
    transfers = find_category(db, user, "Transfers")
    if transfers is None:
        return 0

    rows = (
        db.query(Transaction)
        .join(Item, Transaction.item_id == Item.id)
        .filter(Item.user_id == user.id, Transaction.account_id.isnot(None))
        .order_by(Transaction.date)
        .all()
    )
    movable = {t.id for t in rows if t.category_source not in ("user", "nudge")}

    by_amount: dict[float, list[Transaction]] = {}
    for t in rows:
        by_amount.setdefault(abs(float(t.amount)), []).append(t)

    matched = 0
    used: set = set()
    for t in rows:
        if t.id in used:
            continue
        amt = float(t.amount)
        for other in by_amount.get(abs(amt), []):
            if other.id == t.id or other.id in used:
                continue
            if other.account_id == t.account_id:
                continue
            if float(other.amount) != -amt:
                continue
            if abs((other.date - t.date).days) > WINDOW_DAYS:
                continue
            used.update({t.id, other.id})
            for side in (t, other):
                if side.id in movable and side.category_id != transfers.id:
                    side.category_id = transfers.id
                    side.category = transfers.name
                    side.category_source = SOURCE
                    side.is_ambiguous = False
                    if side.nudge and side.nudge.resolved_at is None:
                        side.nudge.resolved_at = datetime.utcnow()
                    matched += 1
            break
    db.commit()
    return matched
