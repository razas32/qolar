import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import current_user
from app.categorize import find_category, merchant_key, seed_defaults
from app.db import get_db
from app.models import Category, CategoryMapping, Item, MerchantOverride, MerchantType, ReplySynonym, Transaction, User
from app.recategorize import recategorize_user
from app.taxonomy import DEFAULT_MAPPING, primary_of

router = APIRouter(tags=["categories"])


def _cat(c: Category) -> dict:
    return {"id": str(c.id), "name": c.name}


def _own_category(db: Session, user: User, category_id: uuid.UUID) -> Category:
    c = db.query(Category).filter(Category.user_id == user.id, Category.id == category_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="category not found")
    return c


# --- categories -------------------------------------------------------------

@router.get("/categories")
async def list_categories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    seed_defaults(db, user)
    cats = db.query(Category).filter(Category.user_id == user.id).order_by(Category.name).all()
    counts = dict(
        db.query(Transaction.category_id, func.count())
        .join(Item, Transaction.item_id == Item.id)
        .filter(Item.user_id == user.id)
        .group_by(Transaction.category_id)
        .all()
    )
    return [{**_cat(c), "transaction_count": counts.get(c.id, 0)} for c in cats]


class CategoryBody(BaseModel):
    name: str


@router.post("/categories")
async def create_category(body: CategoryBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if find_category(db, user, name):
        raise HTTPException(status_code=409, detail="category exists")
    c = Category(user_id=user.id, name=name)
    db.add(c)
    db.commit()
    return _cat(c)


@router.put("/categories/{category_id}")
async def rename_category(
    category_id: uuid.UUID, body: CategoryBody, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    c = _own_category(db, user, category_id)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    clash = find_category(db, user, name)
    if clash and clash.id != c.id:
        raise HTTPException(status_code=409, detail="category exists")
    c.name = name
    for t in db.query(Transaction).filter(Transaction.category_id == c.id).all():
        t.category = name
    db.commit()
    return _cat(c)


class DeleteCategoryBody(BaseModel):
    move_to: uuid.UUID | None = None


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: uuid.UUID,
    body: DeleteCategoryBody | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    c = _own_category(db, user, category_id)
    target = None
    if body and body.move_to:
        target = _own_category(db, user, body.move_to)
        if target.id == c.id:
            raise HTTPException(status_code=400, detail="invalid move_to")

    for t in db.query(Transaction).filter(Transaction.category_id == c.id).all():
        t.category_id = target.id if target else None
        t.category = target.name if target else None
        if target is None:
            t.category_source = None
            t.is_ambiguous = True
    for m in db.query(CategoryMapping).filter(CategoryMapping.category_id == c.id).all():
        if target:
            m.category_id = target.id
        else:
            db.delete(m)
    for o in db.query(MerchantOverride).filter(MerchantOverride.category_id == c.id).all():
        if target:
            o.category_id = target.id
        else:
            db.delete(o)
    for s in db.query(ReplySynonym).filter(ReplySynonym.category_id == c.id).all():
        if target:
            s.category_id = target.id
        else:
            db.delete(s)
    db.delete(c)
    db.commit()
    return {"ok": True, "moved_to": _cat(target) if target else None}


# --- rules ------------------------------------------------------------------

@router.get("/rules")
async def list_rules(user: User = Depends(current_user), db: Session = Depends(get_db)):
    seed_defaults(db, user)
    overrides = (
        db.query(MerchantOverride)
        .filter(MerchantOverride.user_id == user.id)
        .order_by(MerchantOverride.merchant_key)
        .all()
    )
    mappings = {m.plaid_code: m for m in db.query(CategoryMapping).filter(CategoryMapping.user_id == user.id).all()}
    # Shared knowledge, shown read-only: only merchants this user has seen.
    seen_keys = {
        merchant_key(t.merchant_name, t.description)
        for t in db.query(Transaction).join(Item, Transaction.item_id == Item.id).filter(Item.user_id == user.id).all()
    }
    types = [t for t in db.query(MerchantType).order_by(MerchantType.merchant_key).all() if t.merchant_key in seen_keys]
    all_codes = sorted(set(DEFAULT_MAPPING) | set(mappings))
    return {
        "overrides": [
            {
                "merchant": o.merchant_key,
                "category": o.category.name if o.category else None,
                "category_id": str(o.category_id) if o.category_id else None,
                "always_ask": o.always_ask,
                "source": o.source,
            }
            for o in overrides
        ],
        "mappings": [
            {
                "plaid_code": code,
                "primary": primary_of(code),
                "category": mappings[code].category.name if code in mappings else None,
                "category_id": str(mappings[code].category_id) if code in mappings else None,
            }
            for code in all_codes
        ],
        "merchant_types": [
            {"merchant": t.merchant_key, "plaid_code": t.plaid_code, "confidence": t.confidence, "source": t.source}
            for t in types
        ],
    }


class OverrideBody(BaseModel):
    category: str | None = None
    always_ask: bool = False


@router.put("/rules/overrides/{merchant}")
async def set_override(merchant: str, body: OverrideBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    key = merchant_key(merchant, None)
    if not key:
        raise HTTPException(status_code=400, detail="merchant required")
    category = None
    if not body.always_ask:
        if not body.category:
            raise HTTPException(status_code=400, detail="category or always_ask required")
        category = find_category(db, user, body.category)
        if category is None:
            raise HTTPException(status_code=400, detail="unknown category")
    o = (
        db.query(MerchantOverride)
        .filter(MerchantOverride.user_id == user.id, MerchantOverride.merchant_key == key)
        .first()
    )
    if o is None:
        o = MerchantOverride(user_id=user.id, merchant_key=key, source="user")
        db.add(o)
    o.category_id = category.id if category else None
    o.always_ask = body.always_ask
    o.source = "user"
    db.commit()
    return {"merchant": key, "category": category.name if category else None, "always_ask": o.always_ask, "source": o.source}


@router.delete("/rules/overrides/{merchant}")
async def delete_override(merchant: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    key = merchant_key(merchant, None)
    o = (
        db.query(MerchantOverride)
        .filter(MerchantOverride.user_id == user.id, MerchantOverride.merchant_key == key)
        .first()
    )
    if o is None:
        raise HTTPException(status_code=404, detail="override not found")
    db.delete(o)
    db.commit()
    return {"ok": True}


class MappingBody(BaseModel):
    category: str


@router.put("/rules/mappings/{plaid_code}")
async def set_mapping(plaid_code: str, body: MappingBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if primary_of(plaid_code) is None:
        raise HTTPException(status_code=400, detail="unknown plaid code")
    category = find_category(db, user, body.category)
    if category is None:
        raise HTTPException(status_code=400, detail="unknown category")
    m = (
        db.query(CategoryMapping)
        .filter(CategoryMapping.user_id == user.id, CategoryMapping.plaid_code == plaid_code)
        .first()
    )
    if m is None:
        m = CategoryMapping(user_id=user.id, plaid_code=plaid_code)
        db.add(m)
    m.category_id = category.id
    db.commit()
    return {"plaid_code": plaid_code, "category": category.name}


# --- apply ------------------------------------------------------------------

class RecategorizeBody(BaseModel):
    send_nudges: bool = False
    include_kept: bool = False


@router.post("/recategorize")
async def recategorize(body: RecategorizeBody | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    body = body or RecategorizeBody()
    return await recategorize_user(db, user, send_nudges=body.send_nudges, include_kept=body.include_kept)
