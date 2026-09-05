"""Attach the pre-multi-user data to a real Clerk user.

The multi-user migration parks all existing rows under a placeholder user
(clerk_user_id = 'legacy-owner'). After the original owner signs in once
(which creates their real users row), run this to move everything across
and retire the placeholder.

Usage: DATABASE_URL=<neon url> python3 -m scripts.claim_legacy <clerk_user_id>
"""

import sys

from app.config import settings
from app.db import SessionLocal
from app.models import Category, CategoryMapping, Item, MerchantOverride, ReplySynonym, User

LEGACY = "legacy-owner"


def main(clerk_user_id: str) -> None:
    db = SessionLocal()
    try:
        legacy = db.query(User).filter(User.clerk_user_id == LEGACY).first()
        target = db.query(User).filter(User.clerk_user_id == clerk_user_id).first()
        if legacy is None:
            print("No legacy owner row; nothing to claim.")
            return
        if target is None:
            print(f"No users row for {clerk_user_id} yet -- sign in to the dashboard once first.")
            return

        # The target may already have default categories from their first sign-in.
        # Drop those so the legacy set (with real rules attached) wins cleanly.
        for m in db.query(CategoryMapping).filter(CategoryMapping.user_id == target.id).all():
            db.delete(m)
        for c in db.query(Category).filter(Category.user_id == target.id).all():
            db.delete(c)
        db.flush()

        moved = {}
        for model in (Item, Category, CategoryMapping, MerchantOverride, ReplySynonym):
            n = db.query(model).filter(model.user_id == legacy.id).update({model.user_id: target.id})
            moved[model.__tablename__] = n
        # The single-user era kept the chat id in config, not the DB.
        chat = legacy.telegram_chat_id or settings.telegram_chat_id
        if chat and not target.telegram_chat_id:
            legacy.telegram_chat_id = None
            db.flush()
            target.telegram_chat_id = chat
            moved["telegram_chat_id"] = chat
        db.delete(legacy)
        db.commit()
        print("claimed:", moved)
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
