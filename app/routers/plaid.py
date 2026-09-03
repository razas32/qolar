from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_sync_request import TransactionsSyncRequest

from app.config import settings
from app.db import get_db
from app.plaid_client import client
from app.models import Item, Transaction
from app.categorize import is_ambiguous, known_category
from app.nudge import maybe_send_nudge
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


@router.post("/webhook")
async def plaid_webhook(db: Session = Depends(get_db), payload: dict = Depends(verify_plaid_webhook)):
    if payload.get("webhook_type") != "TRANSACTIONS":
        return {"ok": True}

    plaid_item_id = payload.get("item_id")
    item = db.query(Item).filter(Item.plaid_item_id == plaid_item_id).first()
    if item is None:
        return {"ok": True}

    request = TransactionsSyncRequest(access_token=item.access_token)
    response = client.transactions_sync(request)

    for added in response.added:
        ambiguous = is_ambiguous(added.merchant_name)
        transaction = Transaction(
            item_id=item.id,
            plaid_transaction_id=added.transaction_id,
            merchant_name=added.merchant_name,
            amount=added.amount,
            date=added.date,
            is_ambiguous=ambiguous,
            category=None if ambiguous else known_category(added.merchant_name),
        )
        db.add(transaction)
        db.commit()
        db.refresh(transaction)

        if ambiguous:
            await maybe_send_nudge(transaction, db)

    return {"ok": True, "added": len(response.added)}
