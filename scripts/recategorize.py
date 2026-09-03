"""Seed default categories/mappings, then run the decision ladder over every
transaction that isn't already user- or nudge-categorized. Idempotent; safe
to re-run after changing mappings or overrides.

Usage: python3 -m scripts.recategorize [--nudge]
  --nudge  also send Telegram nudges for anything the ladder can't decide
           (default: just mark them ambiguous so you can review first)
"""

import asyncio
import sys
from collections import Counter

from app.db import SessionLocal
from app.models import Transaction
from app import categorize
from app.nudge import maybe_send_nudge

KEEP = {"user", "nudge"}


async def main(send_nudges: bool) -> None:
    db = SessionLocal()
    try:
        categorize.seed_defaults(db)
        rows = db.query(Transaction).order_by(Transaction.date).all()
        before = Counter((t.category_ref.name if t.category_ref else None) for t in rows)

        touched = 0
        for txn in rows:
            if txn.category_source in KEEP:
                continue
            decision = categorize.decide(db, txn)
            categorize.apply(db, txn, decision)
            txn.category = txn.category_ref.name if txn.category_ref else None
            touched += 1
            if decision.ask and send_nudges:
                await maybe_send_nudge(txn, db)
        db.commit()

        after = Counter((t.category_ref.name if t.category_ref else None) for t in rows)
        sources = Counter(t.category_source for t in rows)
        print(f"re-evaluated {touched}/{len(rows)} transactions")
        print("before:", dict(before))
        print("after: ", dict(after))
        print("by source:", dict(sources))
        asks = [t for t in rows if t.is_ambiguous]
        print(f"still need a nudge: {len(asks)}")
        for t in asks:
            print(f"  - {t.merchant_name or t.description!r} {t.amount} {t.date} [{t.plaid_category_detailed}/{t.plaid_confidence}]")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main("--nudge" in sys.argv))
