"""Manually run the same sync path the /plaid/webhook route runs, for every
linked item. Useful when Plaid's webhook is slow or never arrives -- the
data is often ready via a direct transactions_sync call even before the
webhook notification fires.

Usage: python3 -m scripts.sync_now
"""

import asyncio

from app.db import SessionLocal
from app.models import Item
from app.sync import sync_item_transactions


async def main():
    db = SessionLocal()
    try:
        items = db.query(Item).all()
        if not items:
            print("No linked items.")
            return
        for item in items:
            added = await sync_item_transactions(item, db)
            print(f"item {item.plaid_item_id}: {added} new transaction(s)")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
