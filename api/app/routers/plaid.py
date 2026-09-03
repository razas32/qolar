import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
from app.categorize import find_category
from app.nudge import learn_override
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
    item = Item(plaid_item_id=response.item_id, access_token=response.access_token)
    db.add(item)
    db.commit()
    return {"item_id": item.plaid_item_id}


def _serialize(t: Transaction) -> dict:
    return {
        "id": str(t.id),
        "account_id": t.account_id,
        "merchant_name": t.merchant_name,
        "description": t.description,
        "amount": float(t.amount),
        "date": t.date.isoformat(),
        "pending": t.pending,
        "category": t.category_ref.name if t.category_ref else None,
        "category_source": t.category_source,
        "plaid_category": t.plaid_category_detailed,
        "is_ambiguous": t.is_ambiguous,
        "nudge_pending": t.nudge is not None and t.nudge.resolved_at is None,
    }


@router.get("/transactions", dependencies=[Depends(require_setup_secret)])
async def list_transactions(db: Session = Depends(get_db)):
    rows = (
        db.query(Transaction)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .all()
    )
    return [_serialize(t) for t in rows]


class SetCategory(BaseModel):
    category: str


@router.put("/transactions/{transaction_id}/category", dependencies=[Depends(require_setup_secret)])
async def set_transaction_category(transaction_id: uuid.UUID, body: SetCategory, db: Session = Depends(get_db)):
    """The user says what this was. Sets it, and writes a `user` override for
    the merchant so it outranks everything else from now on."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if txn is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    category = find_category(db, body.category)
    if category is None:
        raise HTTPException(status_code=400, detail="unknown category")

    txn.category_id = category.id
    txn.category_source = "user"
    txn.category = category.name
    txn.is_ambiguous = False
    learn_override(db, txn, category, source="user")
    if txn.nudge and txn.nudge.resolved_at is None:
        from datetime import datetime
        txn.nudge.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(txn)
    return _serialize(txn)


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
