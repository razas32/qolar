import uuid
from datetime import datetime

from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db import Base
from app.crypto import EncryptedString


class User(Base):
    """One person. Identity comes from Clerk; we only keep the id and the
    things Clerk doesn't know about (Telegram)."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_user_id = Column(String, unique=True, nullable=False)
    telegram_chat_id = Column(String, nullable=True, unique=True)
    telegram_link_code = Column(String, nullable=True, unique=True)
    telegram_link_code_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("Item", back_populates="user")


class Item(Base):
    """A single Plaid Link connection (one bank login; may hold several accounts)."""

    __tablename__ = "items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    plaid_item_id = Column(String, unique=True, nullable=False)
    access_token = Column(EncryptedString, nullable=False)
    institution_name = Column(String)
    cursor = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="items")
    transactions = relationship("Transaction", back_populates="item")


class Account(Base):
    """A bank account under an Item (an Item = one login; e.g. chequing + Visa)."""

    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=False)
    plaid_account_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    official_name = Column(String, nullable=True)
    type = Column(String, nullable=True)  # depository | credit | ...
    subtype = Column(String, nullable=True)  # checking | savings | credit card | ...
    mask = Column(String, nullable=True)  # last 4
    created_at = Column(DateTime, default=datetime.utcnow)

    item = relationship("Item")


class Category(Base):
    """A user's own categories. Fully editable; everything else maps onto these."""

    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_categories_user_name"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class MerchantType(Base):
    """GLOBAL fact: what a merchant is, as a Plaid taxonomy code. Not personal
    data -- shared across all users, filled by Plaid or by one LLM lookup."""

    __tablename__ = "merchant_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_key = Column(String, unique=True, nullable=False)
    plaid_code = Column(String, nullable=False)
    confidence = Column(String, nullable=False)  # HIGH | MEDIUM | LOW
    source = Column(String, nullable=False)  # plaid | llm | user
    created_at = Column(DateTime, default=datetime.utcnow)


class CategoryMapping(Base):
    """PER-USER preference: which of my categories a Plaid code lands in."""

    __tablename__ = "category_mappings"
    __table_args__ = (UniqueConstraint("user_id", "plaid_code", name="uq_mappings_user_code"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    plaid_code = Column(String, nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)

    category = relationship("Category")


class MerchantOverride(Base):
    """PER-USER exception for a specific merchant: force a category, or always ask."""

    __tablename__ = "merchant_overrides"
    __table_args__ = (UniqueConstraint("user_id", "merchant_key", name="uq_overrides_user_merchant"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    merchant_key = Column(String, nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    always_ask = Column(Boolean, default=False, nullable=False)
    source = Column(String, nullable=False)  # user | learned
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("Category")


class ReplySynonym(Base):
    """PER-USER: a nudge reply phrase that has already been resolved once."""

    __tablename__ = "reply_synonyms"
    __table_args__ = (UniqueConstraint("user_id", "phrase", name="uq_synonyms_user_phrase"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    phrase = Column(String, nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)

    category = relationship("Category")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=False)
    plaid_transaction_id = Column(String, unique=True, nullable=False)
    account_id = Column(String, nullable=True)
    merchant_name = Column(String)
    description = Column(String, nullable=True)  # Plaid's raw `name`
    amount = Column(Numeric(10, 2), nullable=False)
    date = Column(Date, nullable=False)
    pending = Column(Boolean, default=False, nullable=False)

    plaid_category_primary = Column(String, nullable=True)
    plaid_category_detailed = Column(String, nullable=True)
    plaid_confidence = Column(String, nullable=True)

    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    category_source = Column(String, nullable=True)  # user | learned | plaid | llm | nudge | matched
    # Legacy free-text column from the first slice; superseded by category_id.
    category = Column(String)
    is_ambiguous = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    item = relationship("Item", back_populates="transactions")
    category_ref = relationship("Category")
    nudge = relationship("PendingNudge", back_populates="transaction", uselist=False)

    @property
    def user_id(self):
        return self.item.user_id


class PendingNudge(Base):
    """An open 'what was this for?' question sent to Telegram, awaiting a reply."""

    __tablename__ = "pending_nudges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"), unique=True, nullable=False)
    telegram_message_id = Column(String)
    sent_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    transaction = relationship("Transaction", back_populates="nudge")
