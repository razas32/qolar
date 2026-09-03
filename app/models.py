import uuid
from datetime import datetime

from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db import Base
from app.crypto import EncryptedString


class Item(Base):
    """A single Plaid Link connection (one bank login)."""

    __tablename__ = "items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plaid_item_id = Column(String, unique=True, nullable=False)
    access_token = Column(EncryptedString, nullable=False)
    institution_name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="item")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=False)
    plaid_transaction_id = Column(String, unique=True, nullable=False)
    merchant_name = Column(String)
    amount = Column(Numeric(10, 2), nullable=False)
    date = Column(Date, nullable=False)
    category = Column(String)
    is_ambiguous = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    item = relationship("Item", back_populates="transactions")
    nudge = relationship("PendingNudge", back_populates="transaction", uselist=False)


class PendingNudge(Base):
    """An open 'what was this for?' question sent to Telegram, awaiting a reply."""

    __tablename__ = "pending_nudges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"), unique=True, nullable=False)
    telegram_message_id = Column(String)
    sent_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    transaction = relationship("Transaction", back_populates="nudge")
