from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Category, CategoryMapping, MerchantOverride, MerchantType
from app.security import require_setup_secret

router = APIRouter(tags=["categories"], dependencies=[Depends(require_setup_secret)])


@router.get("/categories")
async def list_categories(db: Session = Depends(get_db)):
    return [{"id": str(c.id), "name": c.name} for c in db.query(Category).order_by(Category.name).all()]


class NewCategory(BaseModel):
    name: str


@router.post("/categories")
async def create_category(body: NewCategory, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if db.query(Category).filter(Category.name.ilike(name)).first():
        raise HTTPException(status_code=409, detail="category exists")
    c = Category(name=name)
    db.add(c)
    db.commit()
    return {"id": str(c.id), "name": c.name}


@router.get("/rules")
async def list_rules(db: Session = Depends(get_db)):
    """Everything that decides a category, for the dashboard to show and edit."""
    overrides = db.query(MerchantOverride).all()
    mappings = db.query(CategoryMapping).order_by(CategoryMapping.plaid_code).all()
    types = db.query(MerchantType).order_by(MerchantType.merchant_key).all()
    return {
        "overrides": [
            {
                "merchant": o.merchant_key,
                "category": o.category.name if o.category else None,
                "always_ask": o.always_ask,
                "source": o.source,
            }
            for o in overrides
        ],
        "mappings": [{"plaid_code": m.plaid_code, "category": m.category.name} for m in mappings],
        "merchant_types": [
            {"merchant": t.merchant_key, "plaid_code": t.plaid_code, "confidence": t.confidence, "source": t.source}
            for t in types
        ],
    }
