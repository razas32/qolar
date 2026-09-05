"""Re-run the decision ladder for every user (or one). Idempotent.

Usage: python3 -m scripts.recategorize [--nudge] [--user <clerk_user_id>]
  --nudge  also send Telegram nudges for anything the ladder can't decide
"""

import asyncio
import json
import sys

from app.db import SessionLocal
from app.models import User
from app.recategorize import recategorize_user


async def main(send_nudges: bool, only: str | None) -> None:
    db = SessionLocal()
    try:
        q = db.query(User)
        if only:
            q = q.filter(User.clerk_user_id == only)
        for user in q.all():
            result = await recategorize_user(db, user, send_nudges=send_nudges)
            print(user.clerk_user_id, json.dumps(result, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    args = sys.argv[1:]
    only = args[args.index("--user") + 1] if "--user" in args else None
    asyncio.run(main("--nudge" in args, only))
