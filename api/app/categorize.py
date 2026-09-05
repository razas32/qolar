"""The decision ladder. Cheapest signal first; stop at the first hit.

  1. user override      (merchant_overrides, source=user)
  2. learned override   (merchant_overrides, source=learned)
  3. merchant type      (merchant_types: GLOBAL fact from Plaid or a prior
                         LLM lookup) -> category_mappings (this user's preference)
  4. LLM classification (only for merchants nobody has ever classified;
                         result is cached globally so it never repeats)
  5. ask                (nudge the user)

Inherently ambiguous merchant types (ASK_CODES) short-circuit to 5 unless
an override exists -- "Amazon" without a rule is always a question.

Everything except merchant_types is scoped to a user.
"""

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app import llm
from app.models import Category, CategoryMapping, MerchantOverride, MerchantType, Transaction, User
from app.taxonomy import ASK_CODES, DEFAULT_CATEGORIES, DEFAULT_MAPPING, primary_of


def merchant_key(merchant_name: str | None, description: str | None) -> str:
    raw = merchant_name or description or ""
    return re.sub(r"\s+", " ", raw.strip().lower())


@dataclass
class Decision:
    category_id: object | None  # UUID
    source: str | None  # user | learned | plaid | llm
    ask: bool


def _mapping_for(db: Session, user: User, code: str | None) -> Category | None:
    """Detailed code first, then its primary."""
    if not code:
        return None
    for candidate in (code, primary_of(code)):
        if not candidate:
            continue
        m = (
            db.query(CategoryMapping)
            .filter(CategoryMapping.user_id == user.id, CategoryMapping.plaid_code == candidate)
            .first()
        )
        if m:
            return m.category
    return None


def decide(db: Session, user: User, txn: Transaction) -> Decision:
    key = merchant_key(txn.merchant_name, txn.description)

    # 1 + 2: overrides (user outranks learned by construction -- one row per merchant)
    override = (
        db.query(MerchantOverride)
        .filter(MerchantOverride.user_id == user.id, MerchantOverride.merchant_key == key)
        .first()
    )
    if override:
        if override.always_ask:
            return Decision(None, None, ask=True)
        return Decision(override.category_id, override.source, ask=False)

    # 3: global merchant type. Plaid's own tag counts when HIGH confidence;
    #    a stored merchant_types row (from Plaid or an earlier LLM call) also counts.
    stored = db.query(MerchantType).filter(MerchantType.merchant_key == key).first()
    code, conf, source = None, None, None
    if stored and stored.confidence != "LOW":
        code, conf, source = stored.plaid_code, stored.confidence, stored.source
    elif txn.plaid_category_detailed and txn.plaid_confidence == "HIGH":
        code, conf, source = txn.plaid_category_detailed, "HIGH", "plaid"
        if not stored and key:
            db.add(MerchantType(merchant_key=key, plaid_code=code, confidence=conf, source="plaid"))
            db.flush()

    # 4: LLM, only if nothing above produced a usable code
    if code is None and key:
        result = llm.classify_merchant(txn.merchant_name, txn.description)
        if result:
            code, conf = result
            source = "llm"
            if not stored:
                db.add(MerchantType(merchant_key=key, plaid_code=code, confidence=conf, source="llm"))
                db.flush()
            if conf == "LOW":
                code = None

    if code is None:
        return Decision(None, None, ask=True)
    if code in ASK_CODES:
        return Decision(None, None, ask=True)

    category = _mapping_for(db, user, code)
    if category is None:
        return Decision(None, None, ask=True)
    return Decision(category.id, source, ask=False)


def apply(db: Session, txn: Transaction, decision: Decision) -> None:
    txn.is_ambiguous = decision.ask
    if decision.ask:
        txn.category_id = None
        txn.category_source = None
        txn.category = None
    else:
        txn.category_id = decision.category_id
        txn.category_source = decision.source
        txn.category = txn.category_ref.name if txn.category_ref else None
    db.flush()


def find_category(db: Session, user: User, text: str) -> Category | None:
    """Exact (case-insensitive) match on one of this user's category names."""
    wanted = text.strip().lower()
    for c in db.query(Category).filter(Category.user_id == user.id).all():
        if c.name.lower() == wanted:
            return c
    return None


def seed_defaults(db: Session, user: User) -> None:
    """Idempotent: create default categories and the default code mapping for
    a user. Never overwrites a mapping the user has changed."""
    by_name = {c.name: c for c in db.query(Category).filter(Category.user_id == user.id).all()}
    for name in DEFAULT_CATEGORIES:
        if name not in by_name:
            c = Category(user_id=user.id, name=name)
            db.add(c)
            db.flush()
            by_name[name] = c
    existing = {m.plaid_code for m in db.query(CategoryMapping).filter(CategoryMapping.user_id == user.id).all()}
    for code, cat_name in DEFAULT_MAPPING.items():
        if code not in existing:
            db.add(CategoryMapping(user_id=user.id, plaid_code=code, category_id=by_name[cat_name].id))
    db.commit()
