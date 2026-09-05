"""Point every linked Plaid Item's webhook at the current WEBHOOK_BASE_URL.

Plaid stores the webhook URL per Item at link time; when the API moves
(tunnel -> Vercel -> custom domain) existing Items keep the old URL until
told otherwise. Run this after any change to WEBHOOK_BASE_URL.

Usage: WEBHOOK_BASE_URL=https://api.qolar.app DATABASE_URL=... python3 -m scripts.update_webhooks
"""

from plaid.model.item_webhook_update_request import ItemWebhookUpdateRequest

from app.config import settings
from app.db import SessionLocal
from app.models import Item
from app.plaid_client import client


def main() -> None:
    url = f"{settings.webhook_base_url.rstrip('/')}/plaid/webhook"
    db = SessionLocal()
    try:
        items = db.query(Item).all()
        if not items:
            print("No linked items.")
            return
        for item in items:
            resp = client.item_webhook_update(
                ItemWebhookUpdateRequest(access_token=item.access_token, webhook=url)
            )
            print(f"{item.plaid_item_id}: webhook -> {resp.item.webhook}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
