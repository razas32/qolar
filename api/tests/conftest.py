"""Tests run against a throwaway Postgres database `loonie_test` on the same
server as DATABASE_URL. Clerk auth is bypassed by overriding `current_user`."""
import uuid
from datetime import date
from decimal import Decimal

import pytest
import sqlalchemy as sa

from app.config import settings

# Point the app at the test database BEFORE app.db builds its engine.
_main_url = sa.engine.make_url(settings.database_url)
_test_url = _main_url.set(database="loonie_test")
object.__setattr__(settings, "database_url", str(_test_url))

_admin = sa.create_engine(_main_url, isolation_level="AUTOCOMMIT")
with _admin.connect() as conn:
    exists = conn.execute(sa.text("select 1 from pg_database where datname='loonie_test'")).scalar()
    if not exists:
        conn.execute(sa.text("create database loonie_test"))
_admin.dispose()

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.auth import current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Category, Item, Transaction, User  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()
        # wipe between tests, children first
        with engine.begin() as conn:
            for t in reversed(Base.metadata.sorted_tables):
                conn.execute(t.delete())


@pytest.fixture()
def user(db):
    u = User(clerk_user_id=f"user_test_{uuid.uuid4().hex[:8]}")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def item(db, user):
    it = Item(user_id=user.id, plaid_item_id=f"item_{uuid.uuid4().hex[:8]}", access_token="tok", institution_name="TD")
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@pytest.fixture()
def category(db, user):
    def make(name: str) -> Category:
        c = Category(user_id=user.id, name=name)
        db.add(c)
        db.commit()
        db.refresh(c)
        return c
    return make


@pytest.fixture()
def mk_txn(db, item):
    def make(merchant="Tim Hortons", amount="4.20", day=1, category=None, source=None, description=None) -> Transaction:
        t = Transaction(
            item_id=item.id,
            plaid_transaction_id=f"pt_{uuid.uuid4().hex}",
            account_id="acc_1",
            merchant_name=merchant,
            description=description or merchant,
            amount=Decimal(amount),
            date=date(2026, 9, day),
            pending=False,
            category_id=category.id if category else None,
            category=category.name if category else None,
            category_source=source,
            is_ambiguous=False,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        return t
    return make


@pytest.fixture()
def client(db, user):
    def _user():
        return db.merge(user)
    app.dependency_overrides[current_user] = _user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
