"""Re-run the decision ladder over one user's existing transactions. Shared by
the CLI script and the POST /recategorize endpoint (so dashboard edits to
rules or mappings can be applied to history)."""

from collections import Counter

from sqlalchemy.orm import Session

from app import categorize
from app.models import Item, Transaction, User
from app.nudge import maybe_send_nudge
from app.transfers import match_transfers

# Sources that represent a human decision; the ladder never overrides these.
KEEP = {"user", "nudge"}


async def recategorize_user(db: Session, user: User, *, send_nudges: bool = False, include_kept: bool = False) -> dict:
    categorize.seed_defaults(db, user)
    rows = (
        db.query(Transaction)
        .join(Item, Transaction.item_id == Item.id)
        .filter(Item.user_id == user.id)
        .order_by(Transaction.date)
        .all()
    )

    touched = 0
    for txn in rows:
        if txn.category_source in KEEP and not include_kept:
            continue
        decision = categorize.decide(db, user, txn)
        categorize.apply(db, txn, decision)
        touched += 1
    db.commit()

    matched = match_transfers(db, user)

    if send_nudges:
        for txn in rows:
            if txn.is_ambiguous:
                await maybe_send_nudge(db, user, txn)

    by_category = Counter((t.category_ref.name if t.category_ref else None) for t in rows)
    by_source = Counter(t.category_source for t in rows)
    asks = [t for t in rows if t.is_ambiguous]
    return {
        "total": len(rows),
        "re_evaluated": touched,
        "transfers_matched": matched,
        "by_category": {(k or "uncategorized"): v for k, v in by_category.items()},
        "by_source": {(k or "none"): v for k, v in by_source.items()},
        "needs_nudge": len(asks),
        "needs_nudge_merchants": sorted({(t.merchant_name or t.description or "?") for t in asks}),
    }
