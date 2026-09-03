from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest

from app.config import settings
from app.db import get_db
from app.plaid_client import client
from app.models import Item, Transaction
from app.sync import sync_item_transactions
from app.security import require_setup_secret, verify_plaid_webhook

router = APIRouter(prefix="/plaid", tags=["plaid"])


@router.post("/link-token", dependencies=[Depends(require_setup_secret)])
async def create_link_token():
    request = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id="loonie-single-user"),
        client_name="Loonie",
        products=[Products("transactions")],
        country_codes=[CountryCode("CA")],
        language="en",
        webhook=f"{settings.webhook_base_url}/plaid/webhook",
    )
    response = client.link_token_create(request)
    return {"link_token": response.link_token}


@router.post("/exchange-token", dependencies=[Depends(require_setup_secret)])
async def exchange_token(public_token: str, db: Session = Depends(get_db)):
    response = client.item_public_token_exchange(
        ItemPublicTokenExchangeRequest(public_token=public_token)
    )
    item = Item(
        plaid_item_id=response.item_id,
        access_token=response.access_token,
    )
    db.add(item)
    db.commit()
    return {"item_id": item.plaid_item_id}


@router.get("/transactions", dependencies=[Depends(require_setup_secret)])
async def list_transactions(db: Session = Depends(get_db)):
    rows = (
        db.query(Transaction)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(t.id),
            "merchant_name": t.merchant_name,
            "amount": float(t.amount),
            "date": t.date.isoformat(),
            "category": t.category,
            "is_ambiguous": t.is_ambiguous,
            "nudge_pending": t.nudge is not None and t.nudge.resolved_at is None,
        }
        for t in rows
    ]


@router.post("/webhook")
async def plaid_webhook(db: Session = Depends(get_db), payload: dict = Depends(verify_plaid_webhook)):
    if payload.get("webhook_type") != "TRANSACTIONS":
        return {"ok": True}

    plaid_item_id = payload.get("item_id")
    item = db.query(Item).filter(Item.plaid_item_id == plaid_item_id).first()
    if item is None:
        return {"ok": True}

    added_count = await sync_item_transactions(item, db)
    return {"ok": True, "added": added_count}
