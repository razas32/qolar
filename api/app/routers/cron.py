import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Item
from app.sync import sync_item_transactions

router = APIRouter(prefix="/cron", tags=["cron"])


async def require_cron_secret(authorization: str = Header(default="")) -> None:
    """Vercel Cron calls with `Authorization: Bearer $CRON_SECRET`."""
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="cron not configured")
    expected = f"Bearer {settings.cron_secret}"
    if not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@router.get("/sync", dependencies=[Depends(require_cron_secret)])
async def cron_sync(db: Session = Depends(get_db)):
    """Scheduled pull of new transactions for every linked item -- the
    fallback for Plaid's webhook, which has been unreliable in practice."""
    results = []
    for item in db.query(Item).all():
        added = await sync_item_transactions(item, db)
        results.append({"item_id": item.plaid_item_id, "added": added})
    return {"ok": True, "items": results}
