import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest

from app.auth import current_user
from app.config import settings
from app.db import get_db
from app.plaid_client import client
from app.models import Account, Item, Transaction, User
from app.categorize import find_category
from app.nudge import learn_override
from app.sync import sync_item_transactions
from app.security import verify_plaid_webhook

router = APIRouter(prefix="/plaid", tags=["plaid"])


def _refresh_accounts(db: Session, item: Item) -> list[Account]:
    """Fetch this item's accounts from Plaid and upsert them locally."""
    resp = client.accounts_get(AccountsGetRequest(access_token=item.access_token))
    if not item.institution_name and getattr(resp.item, "institution_name", None):
        item.institution_name = resp.item.institution_name
    out = []
    for a in resp.accounts:
        acc = db.query(Account).filter(Account.plaid_account_id == a.account_id).first()
        if acc is None:
            acc = Account(item_id=item.id, plaid_account_id=a.account_id, name=a.name)
            db.add(acc)
        acc.name = a.name
        acc.official_name = a.official_name
        acc.type = str(a.type) if a.type else None
        acc.subtype = str(a.subtype) if a.subtype else None
        acc.mask = a.mask
        out.append(acc)
    db.commit()
    return out


def _account_label(acc: Account | None) -> str | None:
    if acc is None:
        return None
    return f"{acc.name} ••{acc.mask}" if acc.mask else acc.name


def _user_items(db: Session, user: User) -> list[Item]:
    return db.query(Item).filter(Item.user_id == user.id).all()


def _user_transactions(db: Session, user: User):
    return (
        db.query(Transaction)
        .join(Item, Transaction.item_id == Item.id)
        .filter(Item.user_id == user.id)
    )


@router.post("/link-token")
async def create_link_token(user: User = Depends(current_user)):
    request = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id=str(user.id)),
        client_name="Qolar",
        products=[Products("transactions")],
        country_codes=[CountryCode("CA")],
        language="en",
        webhook=f"{settings.webhook_base_url}/plaid/webhook",
    )
    response = client.link_token_create(request)
    return {"link_token": response.link_token}


class ExchangeBody(BaseModel):
    public_token: str


@router.post("/exchange-token")
async def exchange_token(body: ExchangeBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    response = client.item_public_token_exchange(ItemPublicTokenExchangeRequest(public_token=body.public_token))
    item = Item(user_id=user.id, plaid_item_id=response.item_id, access_token=response.access_token)
    db.add(item)
    db.commit()
    accounts = _refresh_accounts(db, item)
    added = await sync_item_transactions(item, db)
    return {
        "item_id": item.plaid_item_id,
        "institution": item.institution_name,
        "accounts": [_account_label(a) for a in accounts],
        "transactions_added": added,
    }


@router.get("/accounts")
async def list_accounts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    out = []
    for item in _user_items(db, user):
        accounts = db.query(Account).filter(Account.item_id == item.id).all()
        if not accounts:
            accounts = _refresh_accounts(db, item)
        for a in accounts:
            out.append({
                "id": a.plaid_account_id,
                "label": _account_label(a),
                "name": a.name,
                "official_name": a.official_name,
                "type": a.type,
                "subtype": a.subtype,
                "mask": a.mask,
                "institution": item.institution_name,
                "item_id": item.plaid_item_id,
            })
    return out


@router.post("/sync")
async def sync_mine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Pull new transactions for every item this user has linked."""
    results = []
    for item in _user_items(db, user):
        added = await sync_item_transactions(item, db)
        results.append({"item_id": item.plaid_item_id, "added": added})
    return results


def _serialize(t: Transaction, accounts: dict[str, Account]) -> dict:
    return {
        "id": str(t.id),
        "account_id": t.account_id,
        "account": _account_label(accounts.get(t.account_id)),
        "merchant_name": t.merchant_name,
        "description": t.description,
        "amount": float(t.amount),
        "date": t.date.isoformat(),
        "pending": t.pending,
        "category": t.category_ref.name if t.category_ref else None,
        "category_id": str(t.category_id) if t.category_id else None,
        "category_source": t.category_source,
        "plaid_category": t.plaid_category_detailed,
        "is_ambiguous": t.is_ambiguous,
        "nudge_pending": t.nudge is not None and t.nudge.resolved_at is None,
    }


def _accounts_by_id(db: Session, user: User) -> dict[str, Account]:
    item_ids = [i.id for i in _user_items(db, user)]
    if not item_ids:
        return {}
    return {a.plaid_account_id: a for a in db.query(Account).filter(Account.item_id.in_(item_ids)).all()}


@router.get("/transactions")
async def list_transactions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = _user_transactions(db, user).order_by(Transaction.date.desc(), Transaction.created_at.desc()).all()
    accounts = _accounts_by_id(db, user)
    return [_serialize(t, accounts) for t in rows]


class SetCategory(BaseModel):
    category: str


@router.put("/transactions/{transaction_id}/category")
async def set_transaction_category(
    transaction_id: uuid.UUID, body: SetCategory, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    """The user says what this was. Sets it, and writes a `user` override for
    the merchant so it outranks everything else from now on."""
    txn = _user_transactions(db, user).filter(Transaction.id == transaction_id).first()
    if txn is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    category = find_category(db, user, body.category)
    if category is None:
        raise HTTPException(status_code=400, detail="unknown category")

    txn.category_id = category.id
    txn.category_source = "user"
    txn.category = category.name
    txn.is_ambiguous = False
    learn_override(db, user, txn, category, source="user")
    if txn.nudge and txn.nudge.resolved_at is None:
        txn.nudge.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(txn)
    return _serialize(txn, _accounts_by_id(db, user))


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
