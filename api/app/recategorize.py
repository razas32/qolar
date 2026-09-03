"""Re-run the decision ladder over existing transactions. Shared by the CLI
script and the POST /recategorize endpoint (so dashboard edits to rules or
mappings can be applied to history)."""

from collections import Counter

from sqlalchemy.orm import Session

from app import categorize
from app.models import Transaction
from app.nudge import maybe_send_nudge

# Sources that represent a human decision; the ladder never overrides these.
KEEP = {"user", "nudge"}


async def recategorize_all(db: Session, *, send_nudges: bool = False, include_kept: bool = False) -> dict:
    categorize.seed_defaults(db)
    rows = db.query(Transaction).order_by(Transaction.date).all()

    touched = 0
    for txn in rows:
        if txn.category_source in KEEP and not include_kept:
            continue
        decision = categorize.decide(db, txn)
        categorize.apply(db, txn, decision)
        txn.category = txn.category_ref.name if txn.category_ref else None
        touched += 1
        if decision.ask and send_nudges:
            await maybe_send_nudge(txn, db)
    db.commit()

    by_category = Counter((t.category_ref.name if t.category_ref else None) for t in rows)
    by_source = Counter(t.category_source for t in rows)
    asks = [t for t in rows if t.is_ambiguous]
    return {
        "total": len(rows),
        "re_evaluated": touched,
        "by_category": {(k or "uncategorized"): v for k, v in by_category.items()},
        "by_source": {(k or "none"): v for k, v in by_source.items()},
        "needs_nudge": len(asks),
        "needs_nudge_merchants": sorted({(t.merchant_name or t.description or "?") for t in asks}),
    }
