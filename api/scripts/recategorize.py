"""Seed default categories/mappings, then run the decision ladder over every
transaction that isn't already user- or nudge-categorized. Idempotent.

Usage: python3 -m scripts.recategorize [--nudge]
  --nudge  also send Telegram nudges for anything the ladder can't decide
"""

import asyncio
import json
import sys

from app.db import SessionLocal
from app.recategorize import recategorize_all


async def main(send_nudges: bool) -> None:
    db = SessionLocal()
    try:
        result = await recategorize_all(db, send_nudges=send_nudges)
        print(json.dumps(result, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main("--nudge" in sys.argv))
