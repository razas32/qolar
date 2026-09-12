# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn qolar.app into a Copilot-Money-style dark fintech dashboard with a real chart set and fast categorization (review inbox, bulk select, apply-to-merchant prompt).

**Architecture:** The FastAPI backend gains two small endpoint changes (apply-to-merchant flag on the category PUT, a bulk-category POST) plus a stable `color_index` on categories. The Next.js 16 app gets a sidebar shell with `next-themes`, pure stats helpers in `lib/stats.ts` feeding Recharts components, a restyled table with chip picker and bulk bar, and a `/review` deck. Pages move into an `app/(app)/` route group whose layout owns the shell and the unsorted badge count.

**Tech Stack:** FastAPI 0.115 + SQLAlchemy 2 + Postgres (pytest, httpx TestClient); Next.js 16 App Router, React 19, Tailwind 4, shadcn (base-nova / `@base-ui/react`), Recharts 3, `next-themes`, `sonner`, Vitest; Clerk v7.

**Spec:** `docs/superpowers/specs/2026-09-12-dashboard-redesign-design.md`

## Global Constraints

- Repo: `~/Documents/Projects/docs/projects/qolar/` (`api/`, `web/`). Commit after each task; push at the end. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Python: run everything with `api/.venv/bin/python` / `api/.venv/bin/pytest` from `api/`. Local Postgres from `api/.env` (`DATABASE_URL=postgresql+psycopg2://loonie:…@localhost:5432/loonie`); tests use database `loonie_test`.
- Web: Node from `web/`; `npm run build` must pass before any deploy. Next 16 conventions: `proxy.ts` (not middleware), `await searchParams`, server components by default, `"use client"` only where state/hooks are needed. Read `web/node_modules/next/dist/docs/` before touching routing.
- Clerk v7: `<Show when="signed-in">`, `await auth()`, `UserButton`. Never `<SignedIn>`.
- Colours only via CSS variables / `lib/category-color.ts`. Never hardcode hex in components. Spend is foreground colour; income is `var(--income)`; red is reserved for errors.
- Plaid sign convention: positive amount = money out, negative = money in. "Transfers" category is excluded from spend and income everywhere.
- Deploy: `api/deploy.sh` then `web/deploy.sh` (git-free rsync + `vercel --prod`). Never `vercel` inside the git checkout.
- No new migrations.

---

## File structure

**api/**
- `tests/conftest.py` — test DB (`loonie_test`), `client` fixture with `current_user` overridden, `user`, `item`, `mk_txn` helpers.
- `tests/test_categories.py` — `color_index` stability.
- `tests/test_transaction_category.py` — single PUT, apply-to-merchant, siblings, bulk.
- `app/routers/plaid.py` — `SetCategory.apply_to_merchant`, `_set_user_category`, `_merchant_siblings`, `bulk_category`.
- `app/routers/categories.py` — `color_index` in `_cat`.
- `requirements.txt` — `pytest`.

**web/**
- `lib/category-color.ts` — 12-colour palette, `colorFor(name, categories)`.
- `lib/stats.ts` — pure aggregation helpers.
- `lib/__tests__/{category-color,stats}.test.ts` — Vitest.
- `lib/client-api.ts` — browser-side `setCategory`, `bulkSetCategory` via `/api/proxy`.
- `lib/api.ts` — `Category.color_index`, `SetCategoryResult`, `fetchTransactions` wrapped in `cache()`.
- `app/layout.tsx` — html/body, `ClerkProvider`, `ThemeProvider`, `Toaster`.
- `app/(app)/layout.tsx` — `requireUser`, badge count, `Sidebar` + `MobileTabs` + `<main>`.
- `app/(app)/{page,transactions/page,settings/page,connect/page,review/page}.tsx` — moved pages (+ new review).
- `components/shell/{sidebar,mobile-tabs,theme-toggle,nav-items}.tsx`
- `components/charts/{trend-chart,category-donut,cumulative-chart}.tsx`
- `components/{stat-card,top-merchants,category-chip,merchant-avatar,category-picker,apply-toast,transactions-table,bulk-bar}.tsx`
- `components/review/review-deck.tsx`
- `app/globals.css` — palette tokens for both themes, `--income`.
- `app/api/proxy/[...path]/route.ts` — allow `plaid/transactions/bulk-category`.
- `vitest.config.ts`, `package.json` scripts.

---

### Task 1: API test harness + category `color_index`

**Files:**
- Create: `api/tests/__init__.py`, `api/tests/conftest.py`, `api/tests/test_categories.py`
- Modify: `api/requirements.txt`, `api/app/routers/categories.py:18-20`

**Interfaces:**
- Produces: pytest fixtures `client` (httpx-style `fastapi.testclient.TestClient` with auth overridden), `db` (Session), `user` (User), `item` (Item), `mk_txn(**kw) -> Transaction`. `GET /categories` items gain `color_index: int` in `[0, 12)`.

- [ ] **Step 1: Add pytest to requirements and install**

Append to `api/requirements.txt`:
```
pytest==8.3.3
```
Run: `cd api && .venv/bin/pip install -r requirements.txt`

- [ ] **Step 2: Write conftest**

`api/tests/__init__.py`: empty file.

`api/tests/conftest.py`:
```python
"""Tests run against a throwaway Postgres database `loonie_test` on the same
server as DATABASE_URL. Clerk auth is bypassed by overriding `current_user`."""
import os
import uuid
from datetime import date
from decimal import Decimal

import pytest
import sqlalchemy as sa

from app.config import settings

# Point the app at the test database BEFORE app.db builds its engine.
_main_url = sa.engine.make_url(settings.database_url)
_test_url = _main_url.set(database="loonie_test")
settings.database_url = str(_test_url)

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
```

- [ ] **Step 3: Write the failing color_index test**

`api/tests/test_categories.py`:
```python
def test_categories_have_stable_color_index(client, category):
    category("Coffee")
    category("Groceries")
    first = {c["name"]: c["color_index"] for c in client.get("/categories").json()}
    second = {c["name"]: c["color_index"] for c in client.get("/categories").json()}
    assert first == second
    assert all(0 <= i < 12 for i in first.values())
```

Run: `cd api && .venv/bin/pytest tests/test_categories.py -v`
Expected: FAIL with `KeyError: 'color_index'`.

- [ ] **Step 4: Implement color_index**

In `api/app/routers/categories.py` add `import zlib` at the top and replace `_cat`:
```python
PALETTE_SIZE = 12


def color_index(name: str) -> int:
    """Stable per-name colour slot; the web palette has 12 entries."""
    return zlib.crc32(name.strip().lower().encode("utf-8")) % PALETTE_SIZE


def _cat(c: Category) -> dict:
    return {"id": str(c.id), "name": c.name, "color_index": color_index(c.name)}
```

Run: `cd api && .venv/bin/pytest tests -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/tests api/requirements.txt api/app/routers/categories.py
git commit -m "api: pytest harness on loonie_test; categories expose color_index"
```

---

### Task 2: Category PUT with `apply_to_merchant` and sibling count

**Files:**
- Modify: `api/app/routers/plaid.py:166-192`
- Test: `api/tests/test_transaction_category.py`

**Interfaces:**
- Consumes: fixtures from Task 1.
- Produces: `PUT /plaid/transactions/{id}/category` body `{"category": str, "apply_to_merchant": bool=false}` → serialized txn + `merchant_siblings: int` + `applied: int`. Helpers `_set_user_category(txn, category)` and `_merchant_siblings(db, user, txn) -> list[Transaction]` reused by Task 3.

- [ ] **Step 1: Write failing tests**

`api/tests/test_transaction_category.py`:
```python
from app.models import MerchantOverride


def test_single_edit_sets_category_without_learning(client, db, category, mk_txn):
    coffee = category("Coffee")
    t = mk_txn()
    r = client.put(f"/plaid/transactions/{t.id}/category", json={"category": "Coffee"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["category"] == "Coffee"
    assert body["category_source"] == "user"
    assert body["merchant_siblings"] == 0
    assert body["applied"] == 0
    assert db.query(MerchantOverride).count() == 0


def test_sibling_count_excludes_user_set_rows(client, category, mk_txn):
    coffee = category("Coffee")
    food = category("Food")
    t = mk_txn(day=1)
    mk_txn(day=2)                                  # auto / unset -> sibling
    mk_txn(day=3, category=food, source="plaid")   # bank guess -> sibling
    mk_txn(day=4, category=food, source="user")    # user-set -> not a sibling
    mk_txn(merchant="Metro", day=5)                # other merchant
    r = client.put(f"/plaid/transactions/{t.id}/category", json={"category": "Coffee"})
    assert r.json()["merchant_siblings"] == 2


def test_apply_to_merchant_learns_and_relabels_siblings(client, db, category, mk_txn):
    coffee = category("Coffee")
    food = category("Food")
    t = mk_txn(day=1)
    a = mk_txn(day=2)
    b = mk_txn(day=3, category=food, source="plaid")
    keep = mk_txn(day=4, category=food, source="user")
    r = client.put(f"/plaid/transactions/{t.id}/category", json={"category": "Coffee", "apply_to_merchant": True})
    assert r.status_code == 200, r.text
    assert r.json()["applied"] == 2
    db.expire_all()
    assert {x.category for x in (db.get(type(a), a.id), db.get(type(b), b.id))} == {"Coffee"}
    assert db.get(type(a), a.id).category_source == "learned"
    assert db.get(type(keep), keep.id).category == "Food"
    ov = db.query(MerchantOverride).one()
    assert ov.merchant_key == "tim hortons" and ov.category_id == coffee.id and ov.source == "user"


def test_unknown_category_400(client, mk_txn):
    t = mk_txn()
    r = client.put(f"/plaid/transactions/{t.id}/category", json={"category": "Nope"})
    assert r.status_code == 400
```

Run: `cd api && .venv/bin/pytest tests/test_transaction_category.py -v`
Expected: first three FAIL (`merchant_siblings` KeyError / override count 1); last PASS.

- [ ] **Step 2: Implement**

In `api/app/routers/plaid.py`, ensure imports include `from sqlalchemy import or_` and `from app.categorize import find_category, merchant_key` (add `merchant_key` if absent). Replace the `SetCategory` model and `set_transaction_category` handler with:

```python
class SetCategory(BaseModel):
    category: str
    apply_to_merchant: bool = False


def _set_user_category(txn: Transaction, category: Category) -> None:
    txn.category_id = category.id
    txn.category_source = "user"
    txn.category = category.name
    txn.is_ambiguous = False
    if txn.nudge and txn.nudge.resolved_at is None:
        txn.nudge.resolved_at = datetime.utcnow()


def _merchant_siblings(db: Session, user: User, txn: Transaction) -> list[Transaction]:
    """Other transactions of this user from the same merchant that the user
    hasn't set by hand. Normalization happens in Python (merchant_key), so we
    pre-filter loosely and compare keys here."""
    key = merchant_key(txn.merchant_name, txn.description)
    if not key:
        return []
    rows = (
        _user_transactions(db, user)
        .filter(Transaction.id != txn.id)
        .filter(or_(Transaction.category_source.is_(None), Transaction.category_source != "user"))
        .all()
    )
    return [t for t in rows if merchant_key(t.merchant_name, t.description) == key]


@router.put("/transactions/{transaction_id}/category")
async def set_transaction_category(
    transaction_id: uuid.UUID, body: SetCategory, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    """The user says what this was. With `apply_to_merchant`, also remember
    the merchant (a `user` override) and relabel every other transaction from
    it that the user hasn't set by hand."""
    txn = _user_transactions(db, user).filter(Transaction.id == transaction_id).first()
    if txn is None:
        raise HTTPException(status_code=404, detail="transaction not found")
    category = find_category(db, user, body.category)
    if category is None:
        raise HTTPException(status_code=400, detail="unknown category")

    siblings = _merchant_siblings(db, user, txn)
    _set_user_category(txn, category)
    applied = 0
    if body.apply_to_merchant:
        learn_override(db, user, txn, category, source="user")
        for s in siblings:
            s.category_id = category.id
            s.category = category.name
            s.category_source = "learned"
            s.is_ambiguous = False
            if s.nudge and s.nudge.resolved_at is None:
                s.nudge.resolved_at = datetime.utcnow()
            applied += 1
    db.commit()
    db.refresh(txn)
    return {**_serialize(txn, _accounts_by_id(db, user)), "merchant_siblings": len(siblings), "applied": applied}
```

`learn_override` is already imported from `app.nudge` in this file (check the import block; add if missing).

Run: `cd api && .venv/bin/pytest tests -v`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add api/app/routers/plaid.py api/tests/test_transaction_category.py
git commit -m "api: category edit no longer auto-learns; apply_to_merchant flag + sibling count"
```

---

### Task 3: Bulk category endpoint

**Files:**
- Modify: `api/app/routers/plaid.py` (after `set_transaction_category`)
- Test: `api/tests/test_transaction_category.py` (append)

**Interfaces:**
- Produces: `POST /plaid/transactions/bulk-category` body `{"transaction_ids": [uuid], "category": str}` → `{"updated": int}`. Max 500 ids (422 above).

- [ ] **Step 1: Failing tests**

Append to `api/tests/test_transaction_category.py`:
```python
import uuid as _uuid


def test_bulk_sets_only_owned_ids(client, db, category, mk_txn):
    category("Coffee")
    a, b = mk_txn(day=1), mk_txn(day=2)
    stranger = str(_uuid.uuid4())
    r = client.post("/plaid/transactions/bulk-category", json={"transaction_ids": [str(a.id), str(b.id), stranger], "category": "Coffee"})
    assert r.status_code == 200, r.text
    assert r.json() == {"updated": 2}
    db.expire_all()
    assert db.get(type(a), a.id).category_source == "user"
    assert db.get(type(b), b.id).category == "Coffee"


def test_bulk_rejects_over_500(client, category):
    category("Coffee")
    ids = [str(_uuid.uuid4()) for _ in range(501)]
    r = client.post("/plaid/transactions/bulk-category", json={"transaction_ids": ids, "category": "Coffee"})
    assert r.status_code == 422
```

Run: `cd api && .venv/bin/pytest tests/test_transaction_category.py -v -k bulk`
Expected: FAIL 404.

- [ ] **Step 2: Implement**

Add `from pydantic import BaseModel, Field` (extend the existing pydantic import) and after `set_transaction_category`:
```python
class BulkCategory(BaseModel):
    transaction_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    category: str


@router.post("/transactions/bulk-category")
async def bulk_category(body: BulkCategory, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Set one category on many transactions the user picked explicitly.
    Ids that aren't theirs are ignored. No merchant rule is written."""
    category = find_category(db, user, body.category)
    if category is None:
        raise HTTPException(status_code=400, detail="unknown category")
    rows = _user_transactions(db, user).filter(Transaction.id.in_(body.transaction_ids)).all()
    for t in rows:
        _set_user_category(t, category)
    db.commit()
    return {"updated": len(rows)}
```

Run: `cd api && .venv/bin/pytest tests -v` → all PASS.

- [ ] **Step 3: Commit**

```bash
git add api/app/routers/plaid.py api/tests/test_transaction_category.py
git commit -m "api: POST /plaid/transactions/bulk-category"
```

---

### Task 4: Web deps, theme tokens, category palette

**Files:**
- Modify: `web/package.json`, `web/app/globals.css`, `web/app/layout.tsx`, `web/lib/api.ts`
- Create: `web/vitest.config.ts`, `web/lib/category-color.ts`, `web/lib/__tests__/category-color.test.ts`, `web/components/theme-provider.tsx`

**Interfaces:**
- Produces: CSS vars `--income`, `--sidebar*`, palette; `colorFor(name: string | null, categories: {name: string; color_index: number}[]): string`; `CATEGORY_PALETTE: readonly string[]` (12); `TRANSFERS_COLOR`, `UNCATEGORIZED_COLOR`; `Category.color_index` type; `<ThemeProvider>`.

- [ ] **Step 1: Install deps and shadcn parts**

```bash
cd web
npm i next-themes sonner
npm i -D vitest
npx shadcn@latest add checkbox tooltip sonner --yes
```
`npx shadcn add sonner` writes `components/ui/sonner.tsx` (a themed `<Toaster>`); if it asks about overwriting nothing else, accept. Add script to `package.json`: `"test": "vitest run"`.

`web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

- [ ] **Step 2: Failing palette test**

`web/lib/__tests__/category-color.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CATEGORY_PALETTE, TRANSFERS_COLOR, UNCATEGORIZED_COLOR, colorFor } from "@/lib/category-color";

const cats = [
  { name: "Coffee", color_index: 3 },
  { name: "Groceries", color_index: 11 },
];

describe("colorFor", () => {
  it("has 12 palette entries", () => expect(CATEGORY_PALETTE).toHaveLength(12));
  it("uses the category's color_index", () => expect(colorFor("Coffee", cats)).toBe(CATEGORY_PALETTE[3]));
  it("special-cases Transfers and null", () => {
    expect(colorFor("Transfers", cats)).toBe(TRANSFERS_COLOR);
    expect(colorFor(null, cats)).toBe(UNCATEGORIZED_COLOR);
    expect(colorFor("Uncategorized", cats)).toBe(UNCATEGORIZED_COLOR);
  });
  it("falls back to a hash for unknown names", () => {
    const c = colorFor("Mystery", cats);
    expect(CATEGORY_PALETTE).toContain(c);
    expect(colorFor("Mystery", cats)).toBe(c);
  });
});
```
Run: `cd web && npm test` → FAIL (module missing).

- [ ] **Step 3: Implement palette**

`web/lib/category-color.ts`:
```ts
/** 12 hues tuned to read on both the dark canvas and the light one.
 *  Index comes from the API's `color_index` so every surface agrees. */
export const CATEGORY_PALETTE = [
  "oklch(0.72 0.15 275)", // violet
  "oklch(0.75 0.15 200)", // cyan
  "oklch(0.75 0.17 160)", // green
  "oklch(0.80 0.16 85)",  // amber
  "oklch(0.70 0.19 25)",  // coral
  "oklch(0.72 0.17 340)", // pink
  "oklch(0.70 0.13 240)", // blue
  "oklch(0.78 0.14 120)", // lime
  "oklch(0.72 0.12 50)",  // rust
  "oklch(0.70 0.14 300)", // purple
  "oklch(0.75 0.10 180)", // teal
  "oklch(0.75 0.12 60)",  // gold
] as const;

export const TRANSFERS_COLOR = "oklch(0.62 0.02 260)";
export const UNCATEGORIZED_COLOR = "var(--muted-foreground)";

type Cat = { name: string; color_index: number };

function hashIndex(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % CATEGORY_PALETTE.length;
}

export function colorFor(name: string | null, categories: Cat[]): string {
  if (!name || name === "Uncategorized") return UNCATEGORIZED_COLOR;
  if (name === "Transfers") return TRANSFERS_COLOR;
  const hit = categories.find((c) => c.name === name);
  return CATEGORY_PALETTE[(hit ? hit.color_index : hashIndex(name)) % CATEGORY_PALETTE.length];
}
```
Run: `npm test` → PASS.

- [ ] **Step 4: Theme tokens**

In `web/app/globals.css` replace the `:root { … }` and `.dark { … }` blocks with:
```css
:root {
  --background: oklch(0.985 0.002 260);
  --foreground: oklch(0.15 0.01 260);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.15 0.01 260);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.15 0.01 260);
  --primary: oklch(0.55 0.18 275);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.955 0.004 260);
  --secondary-foreground: oklch(0.2 0.01 260);
  --muted: oklch(0.955 0.004 260);
  --muted-foreground: oklch(0.5 0.01 260);
  --accent: oklch(0.94 0.01 275);
  --accent-foreground: oklch(0.2 0.01 260);
  --destructive: oklch(0.577 0.245 27.325);
  --income: oklch(0.55 0.15 160);
  --border: oklch(0.91 0.005 260);
  --input: oklch(0.91 0.005 260);
  --ring: oklch(0.55 0.18 275);
  --chart-1: oklch(0.55 0.18 275);
  --chart-2: oklch(0.55 0.15 160);
  --chart-3: oklch(0.7 0.13 240);
  --chart-4: oklch(0.8 0.16 85);
  --chart-5: oklch(0.7 0.19 25);
  --radius: 0.75rem;
  --sidebar: oklch(0.975 0.003 260);
  --sidebar-foreground: oklch(0.15 0.01 260);
  --sidebar-primary: oklch(0.55 0.18 275);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --sidebar-accent: oklch(0.93 0.006 260);
  --sidebar-accent-foreground: oklch(0.15 0.01 260);
  --sidebar-border: oklch(0.91 0.005 260);
  --sidebar-ring: oklch(0.55 0.18 275);
}

.dark {
  --background: oklch(0.13 0.005 260);
  --foreground: oklch(0.95 0.005 260);
  --card: oklch(0.17 0.006 260);
  --card-foreground: oklch(0.95 0.005 260);
  --popover: oklch(0.19 0.006 260);
  --popover-foreground: oklch(0.95 0.005 260);
  --primary: oklch(0.72 0.15 275);
  --primary-foreground: oklch(0.13 0.02 275);
  --secondary: oklch(0.22 0.006 260);
  --secondary-foreground: oklch(0.95 0.005 260);
  --muted: oklch(0.21 0.006 260);
  --muted-foreground: oklch(0.65 0.01 260);
  --accent: oklch(0.24 0.01 275);
  --accent-foreground: oklch(0.95 0.005 260);
  --destructive: oklch(0.704 0.191 22.216);
  --income: oklch(0.75 0.17 160);
  --border: oklch(0.24 0.008 260);
  --input: oklch(0.26 0.008 260);
  --ring: oklch(0.72 0.15 275);
  --chart-1: oklch(0.72 0.15 275);
  --chart-2: oklch(0.75 0.17 160);
  --chart-3: oklch(0.7 0.13 240);
  --chart-4: oklch(0.8 0.16 85);
  --chart-5: oklch(0.7 0.19 25);
  --sidebar: oklch(0.15 0.005 260);
  --sidebar-foreground: oklch(0.95 0.005 260);
  --sidebar-primary: oklch(0.72 0.15 275);
  --sidebar-primary-foreground: oklch(0.13 0.02 275);
  --sidebar-accent: oklch(0.21 0.006 260);
  --sidebar-accent-foreground: oklch(0.95 0.005 260);
  --sidebar-border: oklch(0.24 0.008 260);
  --sidebar-ring: oklch(0.72 0.15 275);
}
```
Add `--color-income: var(--income);` inside the `@theme inline { … }` block so `text-income` / `bg-income` utilities exist.

- [ ] **Step 5: Theme provider + root layout**

`web/components/theme-provider.tsx`:
```tsx
"use client";

import { ThemeProvider as NextThemes } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
```

Replace `web/app/layout.tsx`:
```tsx
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Qolar",
  description: "Transactions, categorized.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ClerkProvider>
          <ThemeProvider>
            {children}
            <Toaster position="bottom-center" />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
```
Note: `<Nav />` and the `<main>` wrapper are removed here; Task 6 adds the shell in the `(app)` layout. Until Task 6, pages render without navigation — that's fine within this branch of work.

- [ ] **Step 6: Category type + cache()**

In `web/lib/api.ts`:
```ts
import { cache } from "react";
// ...
export type Category = { id: string; name: string; transaction_count: number; color_index: number };

export type SetCategoryResult = Transaction & { merchant_siblings: number; applied: number };
```
and wrap the transactions fetcher so the layout and page share one request:
```ts
export const fetchTransactions = cache(() => apiFetch<Transaction[]>("/plaid/transactions"));
export const fetchCategories = cache(() => apiFetch<Category[]>("/categories"));
```
(keep the other fetchers as they are; if they're declared as `async function`, convert these two to the `const … = cache(...)` form).

Run: `cd web && npm test && npx tsc --noEmit`
Expected: tests PASS; tsc may complain about `Nav` import nowhere (should be clean since layout no longer imports it).

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "web: theme tokens, next-themes, sonner, vitest, category palette"
```

---

### Task 5: Pure stats helpers

**Files:**
- Create: `web/lib/stats.ts`, `web/lib/__tests__/stats.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Txn = Pick<Transaction, "id"|"amount"|"date"|"category"|"merchant_name"|"description"|"account_id"|"is_ambiguous"|"nudge_pending">;
  export const isTransfer: (c: string | null) => boolean;
  export const needsAttention: (t: Txn) => boolean;
  export const normalizeMerchant: (name: string | null, description: string | null) => string;
  export function totals(rows: Txn[]): { spent: number; income: number; net: number };
  export function delta(current: number, previous: number): number | null;   // percent, null if previous is 0
  export function monthlyTotals(all: Txn[], endMonth: string, count?: number): { month: string; spent: number; income: number }[];
  export function byCategory(rows: Txn[]): { name: string; spent: number; count: number; share: number }[];
  export function cumulativeByDay(rows: Txn[], month: string): { day: number; value: number }[];
  export function topMerchants(rows: Txn[], n?: number): { key: string; name: string; count: number; spent: number; category: string | null }[];
  ```

- [ ] **Step 1: Failing tests**

`web/lib/__tests__/stats.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { byCategory, cumulativeByDay, delta, monthlyTotals, needsAttention, topMerchants, totals, type Txn } from "@/lib/stats";

const t = (o: Partial<Txn> & { amount: number; date: string }): Txn => ({
  id: Math.random().toString(36).slice(2),
  category: null,
  merchant_name: "Tim Hortons",
  description: null,
  account_id: "a",
  is_ambiguous: false,
  nudge_pending: false,
  ...o,
});

const rows: Txn[] = [
  t({ amount: 10, date: "2026-09-01", category: "Coffee" }),
  t({ amount: 30, date: "2026-09-03", category: "Groceries", merchant_name: "Metro" }),
  t({ amount: -1000, date: "2026-09-05", category: "Income", merchant_name: "Payroll" }),
  t({ amount: 500, date: "2026-09-06", category: "Transfers", merchant_name: "TD" }),
  t({ amount: 5, date: "2026-08-20", category: "Coffee" }),
];

describe("totals", () => {
  it("excludes transfers, splits income", () => {
    expect(totals(rows.filter((r) => r.date.startsWith("2026-09")))).toEqual({ spent: 40, income: 1000, net: 960 });
  });
});

describe("delta", () => {
  it("returns percent change or null", () => {
    expect(delta(110, 100)).toBe(10);
    expect(delta(50, 100)).toBe(-50);
    expect(delta(5, 0)).toBeNull();
  });
});

describe("monthlyTotals", () => {
  it("returns the last N months ending at endMonth, zero-filled", () => {
    const m = monthlyTotals(rows, "2026-09", 3);
    expect(m.map((x) => x.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(m[0]).toEqual({ month: "2026-07", spent: 0, income: 0 });
    expect(m[2]).toEqual({ month: "2026-09", spent: 40, income: 1000 });
  });
});

describe("byCategory", () => {
  it("sorts by spend desc with share of total", () => {
    const c = byCategory(rows.filter((r) => r.date.startsWith("2026-09")));
    expect(c.map((x) => x.name)).toEqual(["Groceries", "Coffee"]);
    expect(c[0].share).toBeCloseTo(0.75);
    expect(c[1].count).toBe(1);
  });
  it("labels missing category as Uncategorized", () => {
    expect(byCategory([t({ amount: 3, date: "2026-09-02" })])[0].name).toBe("Uncategorized");
  });
});

describe("cumulativeByDay", () => {
  it("runs a running sum across every day of the month", () => {
    const c = cumulativeByDay(rows, "2026-09");
    expect(c).toHaveLength(30);
    expect(c[0]).toEqual({ day: 1, value: 10 });
    expect(c[2]).toEqual({ day: 3, value: 40 });
    expect(c[29]).toEqual({ day: 30, value: 40 });
  });
});

describe("topMerchants", () => {
  it("groups by normalized merchant, spend only", () => {
    const m = topMerchants([...rows, t({ amount: 2, date: "2026-09-09", merchant_name: "tim  hortons", category: "Coffee" })], 2);
    expect(m[0]).toMatchObject({ name: "Metro", spent: 30, count: 1 });
    expect(m[1]).toMatchObject({ key: "tim hortons", spent: 17, count: 3, category: "Coffee" });
  });
});

describe("needsAttention", () => {
  it("flags uncategorized, ambiguous, or nudged", () => {
    expect(needsAttention(t({ amount: 1, date: "2026-09-01" }))).toBe(true);
    expect(needsAttention(t({ amount: 1, date: "2026-09-01", category: "Coffee", is_ambiguous: true }))).toBe(true);
    expect(needsAttention(t({ amount: 1, date: "2026-09-01", category: "Coffee" }))).toBe(false);
  });
});
```
Run: `npm test` → FAIL (module missing).

- [ ] **Step 2: Implement**

`web/lib/stats.ts`:
```ts
import type { Transaction } from "@/lib/api";
import { monthKey, shiftMonth } from "@/lib/format";

export type Txn = Pick<
  Transaction,
  "id" | "amount" | "date" | "category" | "merchant_name" | "description" | "account_id" | "is_ambiguous" | "nudge_pending"
>;

export const isTransfer = (c: string | null) => c === "Transfers";
export const needsAttention = (t: Txn) => !t.category || t.is_ambiguous || t.nudge_pending;

/** Mirrors the API's merchant_key(): trim, collapse whitespace, lowercase. */
export const normalizeMerchant = (name: string | null, description: string | null) =>
  (name || description || "").trim().replace(/\s+/g, " ").toLowerCase();

const round2 = (n: number) => Math.round(n * 100) / 100;

export function totals(rows: Txn[]) {
  let spent = 0;
  let income = 0;
  for (const t of rows) {
    if (isTransfer(t.category)) continue;
    if (t.amount > 0) spent += t.amount;
    else income -= t.amount;
  }
  return { spent: round2(spent), income: round2(income), net: round2(income - spent) };
}

export function delta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function monthlyTotals(all: Txn[], endMonth: string, count = 6) {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) months.push(shiftMonth(endMonth, -i));
  return months.map((month) => {
    const { spent, income } = totals(all.filter((t) => monthKey(t.date) === month));
    return { month, spent, income };
  });
}

export function byCategory(rows: Txn[]) {
  const acc = new Map<string, { name: string; spent: number; count: number }>();
  let total = 0;
  for (const t of rows) {
    if (t.amount <= 0 || isTransfer(t.category)) continue;
    const name = t.category ?? "Uncategorized";
    const cur = acc.get(name) ?? { name, spent: 0, count: 0 };
    cur.spent += t.amount;
    cur.count += 1;
    total += t.amount;
    acc.set(name, cur);
  }
  return [...acc.values()]
    .map((c) => ({ ...c, spent: round2(c.spent), share: total ? c.spent / total : 0 }))
    .sort((a, b) => b.spent - a.spent);
}

export function cumulativeByDay(rows: Txn[], month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const perDay = new Array<number>(days + 1).fill(0);
  for (const t of rows) {
    if (monthKey(t.date) !== month || t.amount <= 0 || isTransfer(t.category)) continue;
    perDay[Number(t.date.slice(8, 10))] += t.amount;
  }
  const out: { day: number; value: number }[] = [];
  let run = 0;
  for (let d = 1; d <= days; d++) {
    run += perDay[d];
    out.push({ day: d, value: round2(run) });
  }
  return out;
}

export function topMerchants(rows: Txn[], n = 5) {
  const acc = new Map<string, { key: string; name: string; count: number; spent: number; category: string | null }>();
  for (const t of rows) {
    if (t.amount <= 0 || isTransfer(t.category)) continue;
    const key = normalizeMerchant(t.merchant_name, t.description);
    if (!key) continue;
    const cur = acc.get(key) ?? { key, name: t.merchant_name || t.description || key, count: 0, spent: 0, category: t.category };
    cur.count += 1;
    cur.spent += t.amount;
    if (!cur.category && t.category) cur.category = t.category;
    acc.set(key, cur);
  }
  return [...acc.values()]
    .map((m) => ({ ...m, spent: round2(m.spent) }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, n);
}
```
Run: `npm test` → PASS.

- [ ] **Step 3: Commit**

```bash
git add web/lib/stats.ts web/lib/__tests__/stats.test.ts
git commit -m "web: pure stats helpers for overview charts"
```

---

### Task 6: App shell — sidebar, mobile tabs, theme toggle, route group

**Files:**
- Create: `web/app/(app)/layout.tsx`, `web/components/shell/nav-items.ts`, `web/components/shell/sidebar.tsx`, `web/components/shell/mobile-tabs.tsx`, `web/components/shell/theme-toggle.tsx`
- Move: `web/app/page.tsx` → `web/app/(app)/page.tsx`; same for `transactions/`, `settings/`, `connect/` (use `git mv`).
- Delete: `web/components/nav.tsx`
- Modify: `web/app/(app)/connect/page.tsx` (heading "Accounts" if it renders one; `ConnectClient` title text "Accounts")

**Interfaces:**
- Produces: `NAV: { href: string; label: string; icon: LucideIcon }[]` (Overview `/`, Transactions `/transactions`, Review `/review`, Categories & rules `/settings`, Accounts `/connect`); `<Sidebar reviewCount={n} />`, `<MobileTabs reviewCount={n} />`, `<ThemeToggle />`.

- [ ] **Step 1: Move pages into the route group**

```bash
cd web && mkdir -p "app/(app)" && git mv app/page.tsx "app/(app)/page.tsx" && git mv app/transactions "app/(app)/transactions" && git mv app/settings "app/(app)/settings" && git mv app/connect "app/(app)/connect" && git rm components/nav.tsx
```

- [ ] **Step 2: Nav items + theme toggle**

`web/components/shell/nav-items.ts`:
```ts
import { Inbox, Landmark, LayoutDashboard, List, Tags, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: List },
  { href: "/review", label: "Review", icon: Inbox },
  { href: "/settings", label: "Categories & rules", icon: Tags },
  { href: "/connect", label: "Accounts", icon: Landmark },
];

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
```

`web/components/shell/theme-toggle.tsx`:
```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : true;
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
```

- [ ] **Step 3: Sidebar and mobile tabs**

`web/components/shell/sidebar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

export function Sidebar({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
      <Link href="/" className="mb-6 px-3 text-xl font-semibold tracking-tight text-sidebar-foreground">
        Qolar
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {href === "/review" && reviewCount > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                  {reviewCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between px-2 pt-4">
        <UserButton />
        <ThemeToggle />
      </div>
    </aside>
  );
}
```

`web/components/shell/mobile-tabs.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav-items";

export function MobileTabs({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sidebar-border bg-sidebar/95 backdrop-blur md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            <span>{label.split(" ")[0]}</span>
            {href === "/review" && reviewCount > 0 && (
              <span className="absolute right-1/4 top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Group layout**

`web/app/(app)/layout.tsx`:
```tsx
import { MobileTabs } from "@/components/shell/mobile-tabs";
import { Sidebar } from "@/components/shell/sidebar";
import { fetchTransactions } from "@/lib/api";
import { requireUser } from "@/lib/require-user";
import { needsAttention } from "@/lib/stats";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const all = await fetchTransactions().catch(() => []);
  const reviewCount = all.filter(needsAttention).length;
  return (
    <>
      <Sidebar reviewCount={reviewCount} />
      <MobileTabs reviewCount={reviewCount} />
      <main className="min-h-screen px-4 pb-24 pt-6 md:ml-60 md:px-8 md:pb-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </>
  );
}
```
The `.catch(() => [])` covers a fresh user whose API call fails before any item exists; pages still do their own fetching.

- [ ] **Step 5: Rename Connect → Accounts**

In `web/components/connect-client.tsx` change the page heading text from "Connect" to "Accounts" (search for the `<h1>` or `CardTitle` that reads "Connect"; keep the button labels "Connect a bank" / "Connect Telegram").

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: builds; routes listed under `(app)`. Fix any import path breakage from the moves (imports are `@/` aliases so there should be none).

- [ ] **Step 7: Commit**

```bash
git add -A web
git commit -m "web: sidebar shell, mobile tabs, theme toggle, (app) route group"
```

---

### Task 7: Overview — stat cards, charts, top merchants

**Files:**
- Create: `web/components/stat-card.tsx`, `web/components/charts/trend-chart.tsx`, `web/components/charts/category-donut.tsx`, `web/components/charts/cumulative-chart.tsx`, `web/components/top-merchants.tsx`
- Modify: `web/app/(app)/page.tsx` (rewrite), delete `web/components/spend-chart.tsx`

**Interfaces:**
- Consumes: `lib/stats.ts` (Task 5), `colorFor` (Task 4), `Filters` (existing), `TransactionsTable` (existing; restyled in Task 8 with the same props).
- Produces: `<StatCard label value delta? hint? href? />`, `<TrendChart data={{month,spent,income}[]} selected={month} />`, `<CategoryDonut data={byCategory()} previous={byCategory(prevRows)} categories linkBase />`, `<CumulativeChart current previous month />`, `<TopMerchants rows categories />`.

- [ ] **Step 1: StatCard**

`web/components/stat-card.tsx`:
```tsx
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = { label: string; value: string; delta?: number | null; hint?: string; href?: string; tone?: "default" | "income" };

export function StatCard({ label, value, delta, hint, href, tone = "default" }: Props) {
  const body = (
    <Card className={cn("h-full", href && "transition-colors hover:bg-accent/40")}>
      <CardContent className="flex h-full flex-col justify-between gap-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-semibold tabular-nums", tone === "income" && "text-income")}>{value}</p>
        <p className="text-xs text-muted-foreground">
          {delta !== undefined && delta !== null ? (
            <span className={cn(delta > 0 ? "text-foreground" : "text-income")}>
              {delta > 0 ? "+" : ""}
              {delta}% vs last month
            </span>
          ) : (
            hint ?? " "
          )}
        </p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
```

- [ ] **Step 2: TrendChart**

`web/components/charts/trend-chart.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { money } from "@/lib/format";

const config = {
  spent: { label: "Spent", color: "var(--chart-1)" },
  income: { label: "Income", color: "var(--chart-2)" },
} satisfies ChartConfig;

type Row = { month: string; spent: number; income: number };

const short = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-CA", { month: "short" });

export function TrendChart({ data, selected }: { data: Row[]; selected: string }) {
  const router = useRouter();
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={data} barCategoryGap={18} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" tickFormatter={short} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
        <YAxis hide />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent labelFormatter={(l) => short(String(l))} formatter={(v, n) => [money(Number(v)), n === "spent" ? " Spent" : " Income"]} />}
        />
        <Bar dataKey="spent" fill="var(--color-spent)" radius={[6, 6, 0, 0]} maxBarSize={36} onClick={(d) => router.push(`/?month=${(d as Row).month}`)} className="cursor-pointer">
          {data.map((d) => (
            <Cell key={d.month} fillOpacity={d.month === selected ? 1 : 0.45} />
          ))}
        </Bar>
        <Bar dataKey="income" fill="var(--color-income)" radius={[6, 6, 0, 0]} maxBarSize={14}>
          {data.map((d) => (
            <Cell key={d.month} fillOpacity={d.month === selected ? 1 : 0.45} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
```
(Recharts 3 `Bar onClick` receives the data payload as the first arg; if the type is `unknown`, cast via `(d as unknown as Row)`.)

- [ ] **Step 3: CategoryDonut**

`web/components/charts/category-donut.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { colorFor } from "@/lib/category-color";
import { money } from "@/lib/format";
import { delta } from "@/lib/stats";
import { cn } from "@/lib/utils";

type Slice = { name: string; spent: number; count: number; share: number };
type Cat = { name: string; color_index: number };

export function CategoryDonut({ data, previous, categories, linkBase }: { data: Slice[]; previous: Slice[]; categories: Cat[]; linkBase: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.spent, 0);
  const prev = new Map(previous.map((p) => [p.name, p.spent]));
  const href = (name: string) => {
    const sep = linkBase.includes("?") ? "&" : "?";
    return `${linkBase}${sep}category=${encodeURIComponent(name === "Uncategorized" ? "__uncategorized__" : name)}`;
  };
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No spending in this period.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
      <div className="relative mx-auto h-44 w-44">
        <ChartContainer config={{}} className="h-44 w-44">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideIndicator formatter={(v) => money(Number(v))} />} />
            <Pie data={data} dataKey="spent" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} strokeWidth={0}
                 onMouseEnter={(_, i) => setHover(data[i].name)} onMouseLeave={() => setHover(null)}>
              {data.map((d) => (
                <Cell key={d.name} fill={colorFor(d.name, categories)} fillOpacity={hover && hover !== d.name ? 0.35 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Spent</span>
          <span className="text-lg font-semibold tabular-nums">{money(total)}</span>
        </div>
      </div>
      <ul className="divide-y divide-border text-sm">
        {data.map((d) => {
          const dl = delta(d.spent, prev.get(d.name) ?? 0);
          return (
            <li key={d.name} onMouseEnter={() => setHover(d.name)} onMouseLeave={() => setHover(null)}>
              <Link href={href(d.name)} className={cn("flex items-center gap-3 py-2 transition-opacity", hover && hover !== d.name && "opacity-50")}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorFor(d.name, categories) }} />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{Math.round(d.share * 100)}%</span>
                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{dl === null ? "" : `${dl > 0 ? "+" : ""}${dl}%`}</span>
                <span className="w-20 text-right tabular-nums">{money(d.spent)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: CumulativeChart**

`web/components/charts/cumulative-chart.tsx`:
```tsx
"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { money } from "@/lib/format";

const config = {
  current: { label: "This month", color: "var(--chart-1)" },
  previous: { label: "Last month", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

type Pt = { day: number; value: number };

export function CumulativeChart({ current, previous, today }: { current: Pt[]; previous: Pt[]; today?: number }) {
  const prev = new Map(previous.map((p) => [p.day, p.value]));
  const data = current.map((c) => ({
    day: c.day,
    current: today !== undefined && c.day > today ? null : c.value,
    previous: prev.get(c.day) ?? null,
  }));
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} ticks={[1, 8, 15, 22, 29]} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => `Day ${d}`} formatter={(v, n) => [money(Number(v)), n === "current" ? " This month" : " Last month"]} />} />
        <Line type="monotone" dataKey="previous" stroke="var(--color-previous)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls />
        <Line type="monotone" dataKey="current" stroke="var(--color-current)" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 5: TopMerchants**

`web/components/top-merchants.tsx`:
```tsx
import { colorFor } from "@/lib/category-color";
import { money } from "@/lib/format";
import { topMerchants, type Txn } from "@/lib/stats";

type Cat = { name: string; color_index: number };

export function TopMerchants({ rows, categories }: { rows: Txn[]; categories: Cat[] }) {
  const top = topMerchants(rows, 5);
  if (top.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  const max = top[0].spent;
  return (
    <ul className="space-y-3 text-sm">
      {top.map((m) => (
        <li key={m.key} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: colorFor(m.category, categories) }} />
            <span className="flex-1 truncate">{m.name}</span>
            <span className="text-xs text-muted-foreground">{m.count}×</span>
            <span className="w-20 text-right tabular-nums">{money(m.spent)}</span>
          </div>
          <div className="h-1 rounded-full bg-muted">
            <div className="h-1 rounded-full" style={{ width: `${(m.spent / max) * 100}%`, background: colorFor(m.category, categories) }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Rewrite the overview page**

Replace `web/app/(app)/page.tsx`:
```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Filters } from "@/components/filters";
import { StatCard } from "@/components/stat-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CumulativeChart } from "@/components/charts/cumulative-chart";
import { TopMerchants } from "@/components/top-merchants";
import { TransactionsTable } from "@/components/transactions-table";
import { fetchAccounts, fetchCategories, fetchTransactions } from "@/lib/api";
import { requireUser } from "@/lib/require-user";
import { currentMonthKey, money, monthKey, monthLabel, shiftMonth } from "@/lib/format";
import { byCategory, cumulativeByDay, delta, monthlyTotals, needsAttention, totals } from "@/lib/stats";

type Search = { month?: string; account?: string };

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser();
  const sp = await searchParams;
  const [all, accounts, categories] = await Promise.all([fetchTransactions(), fetchAccounts(), fetchCategories()]);

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Qolar</h1>
        <p className="text-muted-foreground">
          Connect a bank to get started. Your login happens inside Plaid&apos;s secure window and never touches Qolar.
        </p>
        <Link href="/connect" className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
          Connect a bank
        </Link>
      </div>
    );
  }

  const months = [...new Set(all.map((t) => monthKey(t.date)))].sort();
  const month = sp.month ?? (months.includes(currentMonthKey()) ? currentMonthKey() : months.at(-1) ?? currentMonthKey());
  const account = sp.account ?? "all";
  const scoped = all.filter((t) => account === "all" || t.account_id === account);
  const rows = scoped.filter((t) => monthKey(t.date) === month);
  const prevRows = scoped.filter((t) => monthKey(t.date) === shiftMonth(month, -1));

  const cur = totals(rows);
  const prev = totals(prevRows);
  const unsorted = rows.filter(needsAttention).length;
  const today = month === currentMonthKey() ? new Date().getDate() : undefined;

  const qs = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ month, ...(account !== "all" ? { account } : {}), ...extra });
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{monthLabel(month)}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} transactions · {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <Filters month={month} account={account} accounts={accounts} minMonth={months[0]} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Spent" value={money(cur.spent)} delta={delta(cur.spent, prev.spent)} />
        <StatCard label="Income" value={money(cur.income)} delta={delta(cur.income, prev.income)} tone="income" />
        <StatCard label="Net" value={`${cur.net < 0 ? "−" : ""}${money(cur.net)}`} hint="income minus spend" />
        <StatCard label="Unsorted" value={String(unsorted)} hint={unsorted ? "tap to review" : "all sorted"} href="/review" />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title="Spend trend" className="lg:col-span-7">
          <TrendChart data={monthlyTotals(scoped, month, 6)} selected={month} />
        </Panel>
        <Panel title="By category" className="lg:col-span-5">
          <CategoryDonut data={byCategory(rows)} previous={byCategory(prevRows)} categories={categories} linkBase={`/transactions${qs()}`} />
        </Panel>
        <Panel title="Cumulative spend" className="lg:col-span-7">
          <CumulativeChart current={cumulativeByDay(rows, month)} previous={cumulativeByDay(prevRows, shiftMonth(month, -1))} today={today} />
        </Panel>
        <Panel title="Top merchants" className="lg:col-span-5">
          <TopMerchants rows={rows} categories={categories} />
        </Panel>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Recent</h2>
        <Link href={`/transactions${qs()}`} className="text-sm text-muted-foreground hover:text-foreground">
          All transactions
        </Link>
      </div>
      <TransactionsTable transactions={rows.slice(0, 8)} categories={categories} showAccount={account === "all"} />
    </div>
  );
}
```
Delete `web/components/spend-chart.tsx` (`git rm`). Note `Filters` no longer needs "All time" for the overview; leave the component as is (Task 8 doesn't touch it either).

- [ ] **Step 7: Build and eyeball**

Run: `cd web && npm run build && npm run dev -- --port 3100` (API running locally: `cd api && .venv/bin/uvicorn app.main:app --port 8000`). Open http://localhost:3100 in both themes. Check: four stat cards, bars for six months, donut with centre total, cumulative line with ghost line, top merchants, recent table.

- [ ] **Step 8: Commit**

```bash
git add -A web
git commit -m "web: overview with stat cards, trend, donut, cumulative and top merchants"
```

---

### Task 8: Transactions table restyle, chip picker, apply-to-merchant toast

**Files:**
- Create: `web/lib/client-api.ts`, `web/components/category-chip.tsx`, `web/components/merchant-avatar.tsx`, `web/components/apply-toast.tsx`
- Modify: `web/components/category-picker.tsx` (rewrite), `web/components/transactions-table.tsx` (rewrite), `web/app/api/proxy/[...path]/route.ts`

**Interfaces:**
- Produces:
  - `setCategory(id: string, category: string, applyToMerchant?: boolean): Promise<SetCategoryResult>`; `bulkSetCategory(ids: string[], category: string): Promise<{updated: number}>`.
  - `<CategoryChip name categories size? onClick? />`, `<MerchantAvatar name color />`.
  - `askApplyToMerchant({ transactionId, category, merchant, siblings, onApplied })` — sonner toast with Yes action.
  - `<CategoryPicker transactionId value merchant categories />` (chip that opens a menu; handles toast + refresh).
  - `TransactionsTable` props unchanged: `{ transactions, categories, showAccount? }` — but `categories` is now `Category[]` (needs `color_index`).

- [ ] **Step 1: Proxy allowlist + client API**

Add to `ALLOW` in `web/app/api/proxy/[...path]/route.ts`:
```ts
  { method: "POST", pattern: /^plaid\/transactions\/bulk-category$/ },
```

`web/lib/client-api.ts`:
```ts
import type { SetCategoryResult } from "@/lib/api";

async function call<T>(path: string, method: "PUT" | "POST", body: unknown): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const setCategory = (id: string, category: string, applyToMerchant = false) =>
  call<SetCategoryResult>(`plaid/transactions/${id}/category`, "PUT", { category, apply_to_merchant: applyToMerchant });

export const bulkSetCategory = (ids: string[], category: string) =>
  call<{ updated: number }>("plaid/transactions/bulk-category", "POST", { transaction_ids: ids, category });
```

- [ ] **Step 2: Chip and avatar**

`web/components/category-chip.tsx`:
```tsx
import { colorFor } from "@/lib/category-color";
import { cn } from "@/lib/utils";

type Cat = { name: string; color_index: number };
type Props = { name: string | null; categories: Cat[]; size?: "sm" | "md"; className?: string; onClick?: () => void; active?: boolean };

export function CategoryChip({ name, categories, size = "sm", className, onClick, active }: Props) {
  const color = colorFor(name, categories);
  const label = name ?? "Uncategorized";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card font-medium whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        onClick && "transition-colors hover:bg-accent",
        active && "ring-2 ring-ring",
        !name && "text-muted-foreground",
        className,
      )}
    >
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </Tag>
  );
}
```

`web/components/merchant-avatar.tsx`:
```tsx
export function MerchantAvatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
      style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
    >
      {initials}
    </span>
  );
}
```

- [ ] **Step 3: Apply-to-merchant toast**

`web/components/apply-toast.tsx`:
```ts
import { toast } from "sonner";
import { setCategory } from "@/lib/client-api";

type Args = { transactionId: string; category: string; merchant: string; siblings: number; onApplied: () => void };

/** After a single edit: offer to relabel the merchant's other transactions.
 *  Dismissal (or 8s) means "just this one". */
export function askApplyToMerchant({ transactionId, category, merchant, siblings, onApplied }: Args) {
  if (siblings <= 0) return;
  toast(`Apply ${category} to ${siblings} other ${merchant}?`, {
    duration: 8000,
    action: {
      label: "Yes",
      onClick: async () => {
        try {
          const r = await setCategory(transactionId, category, true);
          toast.success(`Updated ${r.applied} more from ${merchant}`);
          onApplied();
        } catch {
          toast.error("Couldn't apply to merchant");
        }
      },
    },
    cancel: { label: "Just this one", onClick: () => {} },
  });
}
```

- [ ] **Step 4: Category picker (chip + menu)**

Rewrite `web/components/category-picker.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CategoryChip } from "@/components/category-chip";
import { askApplyToMerchant } from "@/components/apply-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { colorFor } from "@/lib/category-color";
import { setCategory } from "@/lib/client-api";

type Cat = { id: string; name: string; color_index: number };
type Props = { transactionId: string; value: string | null; merchant: string; categories: Cat[] };

export function CategoryPicker({ transactionId, value, merchant, categories }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  async function pick(name: string) {
    setOpen(false);
    if (name === value) return;
    try {
      const r = await setCategory(transactionId, name);
      startTransition(() => router.refresh());
      askApplyToMerchant({ transactionId, category: name, merchant, siblings: r.merchant_siblings, onApplied: () => router.refresh() });
    } catch {
      toast.error("Couldn't save category");
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger disabled={pending} render={<CategoryChip name={value} categories={categories} onClick={() => setOpen(true)} />} />
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        {categories.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => pick(c.name)} className="gap-2">
            <span className="size-2 rounded-full" style={{ background: colorFor(c.name, categories) }} />
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```
Check `components/ui/dropdown-menu.tsx` for how the trigger composes in this shadcn/base-ui version: if `DropdownMenuTrigger` doesn't accept `render`, use `<DropdownMenuTrigger asChild>` or wrap the chip inside the trigger as children (`<DropdownMenuTrigger className="…"><CategoryChip … /></DropdownMenuTrigger>` with no `onClick` on the chip). Whatever the component supports, the visible trigger must be the chip.

- [ ] **Step 5: Table rewrite (no bulk yet — Task 9 adds it)**

Rewrite `web/components/transactions-table.tsx`:
```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CategoryPicker } from "@/components/category-picker";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { colorFor } from "@/lib/category-color";
import type { Category, Transaction } from "@/lib/api";
import { formatDate, isCredit, money, sourceLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TableProps = { transactions: Transaction[]; categories: Category[]; showAccount?: boolean };

export function TransactionRow({ t, categories, showAccount }: { t: Transaction; categories: Category[]; showAccount: boolean }) {
  const merchant = t.merchant_name ?? t.description ?? "Unknown merchant";
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", t.nudge_pending && "bg-primary/5")}>
      <MerchantAvatar name={merchant} color={colorFor(t.category, categories)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{merchant}</span>
          {t.pending && <Badge variant="outline" className="text-[10px]">pending</Badge>}
          {t.nudge_pending && <Badge variant="secondary" className="text-[10px]">asked on Telegram</Badge>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {formatDate(t.date)}
          {showAccount && t.account ? ` · ${t.account}` : ""}
          {t.category_source ? ` · ${sourceLabel[t.category_source] ?? t.category_source}` : ""}
        </div>
      </div>
      <CategoryPicker transactionId={t.id} value={t.category} merchant={merchant} categories={categories} />
      <span className={cn("w-24 text-right tabular-nums", isCredit(t.amount) && "text-income")}>
        {isCredit(t.amount) ? "+" : ""}
        {money(t.amount)}
      </span>
    </li>
  );
}

export function TransactionsTable({ transactions, categories, showAccount = true }: TableProps) {
  if (transactions.length === 0) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Nothing here for this filter.</Card>;
  }
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-border">
        {transactions.map((t) => (
          <TransactionRow key={t.id} t={t} categories={categories} showAccount={showAccount} />
        ))}
      </ul>
    </Card>
  );
}
```
Then update `web/app/(app)/transactions/page.tsx` and the overview page if their `categories` prop type complains (they already pass `fetchCategories()` results, which now include `color_index`). Update the footnote on the transactions page to: "Changing a category asks whether to apply it to the merchant's other transactions."

- [ ] **Step 6: Build + manual check**

`npm run build`; then in dev change a category on a Tim Hortons row → toast appears with the sibling count; Yes relabels the rest (refresh shows "learned" source).

- [ ] **Step 7: Commit**

```bash
git add -A web
git commit -m "web: list-style transactions, chip picker, apply-to-merchant toast"
```

---

### Task 9: Bulk select

**Files:**
- Create: `web/components/bulk-bar.tsx`
- Modify: `web/components/transactions-table.tsx`

**Interfaces:**
- Consumes: `bulkSetCategory` (Task 8), `Checkbox` from `components/ui/checkbox` (Task 4).
- Produces: `TransactionsTable` gains optional `selectable?: boolean` (default false; the transactions page passes `true`).

- [ ] **Step 1: BulkBar**

`web/components/bulk-bar.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { colorFor } from "@/lib/category-color";
import { bulkSetCategory } from "@/lib/client-api";

type Cat = { id: string; name: string; color_index: number };

export function BulkBar({ ids, categories, onDone }: { ids: string[]; categories: Cat[]; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  if (ids.length === 0) return null;

  async function apply(name: string) {
    setBusy(true);
    try {
      const r = await bulkSetCategory(ids, name);
      toast.success(`Set ${r.updated} to ${name}`);
      onDone();
      startTransition(() => router.refresh());
    } catch {
      toast.error("Couldn't update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-4 md:bottom-6 md:left-60">
      <div className="flex items-center gap-3 rounded-full border border-border bg-popover px-4 py-2 shadow-lg">
        <span className="text-sm tabular-nums">{ids.length} selected</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" disabled={busy}>Set category</Button>} />
          <DropdownMenuContent align="center" className="max-h-80 w-56 overflow-y-auto">
            {categories.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => apply(c.name)} className="gap-2">
                <span className="size-2 rounded-full" style={{ background: colorFor(c.name, categories) }} />
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          Clear
        </Button>
      </div>
    </div>
  );
}
```
(Same `render` vs `asChild` note as Task 8 Step 4.)

- [ ] **Step 2: Selection in the table**

In `web/components/transactions-table.tsx`:
- Add `import { useState } from "react";`, `import { Checkbox } from "@/components/ui/checkbox";`, `import { BulkBar } from "@/components/bulk-bar";`.
- `TableProps` gains `selectable?: boolean`.
- `TransactionRow` gains props `selected?: boolean; onToggle?: () => void` and renders, before the avatar, when `onToggle` is provided:
  ```tsx
  <Checkbox checked={!!selected} onCheckedChange={() => onToggle()} aria-label="Select transaction" className="md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:data-[state=checked]:opacity-100" />
  ```
  and add `group` to the `<li>` className. (If the checkbox uses `data-checked` rather than `data-state=checked` in this base-ui version, use `md:data-[checked]:opacity-100`.)
- `TransactionsTable` becomes:
  ```tsx
  export function TransactionsTable({ transactions, categories, showAccount = true, selectable = false }: TableProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const toggle = (id: string) =>
      setSelected((s) => {
        const n = new Set(s);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
    const allSelected = transactions.length > 0 && transactions.every((t) => selected.has(t.id));
    if (transactions.length === 0) {
      return <Card className="p-10 text-center text-sm text-muted-foreground">Nothing here for this filter.</Card>;
    }
    return (
      <>
        <Card className="overflow-hidden p-0">
          {selectable && (
            <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground">
              <Checkbox checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(transactions.map((t) => t.id)))} aria-label="Select all" />
              Select all {transactions.length}
            </div>
          )}
          <ul className="divide-y divide-border">
            {transactions.map((t) => (
              <TransactionRow key={t.id} t={t} categories={categories} showAccount={showAccount}
                selected={selected.has(t.id)} onToggle={selectable ? () => toggle(t.id) : undefined} />
            ))}
          </ul>
        </Card>
        {selectable && <BulkBar ids={[...selected]} categories={categories} onDone={() => setSelected(new Set())} />}
      </>
    );
  }
  ```
- In `web/app/(app)/transactions/page.tsx` pass `selectable` to the table.

- [ ] **Step 3: Build + check**

`npm run build`; in dev select three rows → bar appears → set category → rows update, bar clears.

- [ ] **Step 4: Commit**

```bash
git add -A web
git commit -m "web: bulk select with floating category bar"
```

---

### Task 10: Review inbox

**Files:**
- Create: `web/app/(app)/review/page.tsx`, `web/components/review/review-deck.tsx`

**Interfaces:**
- Consumes: `needsAttention`, `setCategory`, `askApplyToMerchant`, `CategoryChip`, `MerchantAvatar`, `colorFor`.

- [ ] **Step 1: Page**

`web/app/(app)/review/page.tsx`:
```tsx
import { ReviewDeck } from "@/components/review/review-deck";
import { fetchCategories, fetchTransactions } from "@/lib/api";
import { requireUser } from "@/lib/require-user";
import { needsAttention } from "@/lib/stats";

export default async function ReviewPage() {
  await requireUser();
  const [all, categories] = await Promise.all([fetchTransactions(), fetchCategories()]);
  const queue = all.filter(needsAttention).sort((a, b) => (a.date < b.date ? 1 : -1));
  const ordered = [...categories].sort((a, b) => b.transaction_count - a.transaction_count || a.name.localeCompare(b.name));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-muted-foreground">Everything Qolar wasn&apos;t sure about. Press 1–9 to pick, S to skip, T for transfer.</p>
      </div>
      <ReviewDeck queue={queue} categories={ordered} />
    </div>
  );
}
```

- [ ] **Step 2: Deck**

`web/components/review/review-deck.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { askApplyToMerchant } from "@/components/apply-toast";
import { CategoryChip } from "@/components/category-chip";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Category, Transaction } from "@/lib/api";
import { colorFor } from "@/lib/category-color";
import { setCategory } from "@/lib/client-api";
import { formatDate, isCredit, money } from "@/lib/format";

const humanize = (code: string | null) => (code ? code.toLowerCase().replace(/_/g, " ") : null);

export function ReviewDeck({ queue, categories }: { queue: Transaction[]; categories: Category[] }) {
  const router = useRouter();
  const [items, setItems] = useState(queue);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const done = index >= items.length;
  const current = done ? null : items[index];
  const total = queue.length;

  const visible = useMemo(
    () => (query ? categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())) : categories),
    [categories, query],
  );

  const pick = useCallback(
    async (name: string) => {
      if (!current || busy) return;
      setBusy(true);
      const merchant = current.merchant_name ?? current.description ?? "this merchant";
      try {
        const r = await setCategory(current.id, name);
        setIndex((i) => i + 1);
        setQuery("");
        askApplyToMerchant({ transactionId: current.id, category: name, merchant, siblings: r.merchant_siblings, onApplied: () => router.refresh() });
        router.refresh();
      } catch {
        toast.error("Couldn't save");
      } finally {
        setBusy(false);
      }
    },
    [current, busy, router],
  );

  const skip = useCallback(() => {
    setItems((list) => list.filter((_, i) => i !== index));
    setQuery("");
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) return;
      const typing = document.activeElement === search.current;
      if (e.key === "/" && !typing) { e.preventDefault(); search.current?.focus(); return; }
      if (typing) { if (e.key === "Escape") search.current?.blur(); return; }
      if (e.key >= "1" && e.key <= "9") { const c = visible[Number(e.key) - 1]; if (c) pick(c.name); }
      else if (e.key.toLowerCase() === "s") skip();
      else if (e.key.toLowerCase() === "t") pick("Transfers");
      else if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, visible, pick, skip, index]);

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-income/15 text-income"><Check className="size-6" /></span>
          <p className="text-lg font-medium">All sorted</p>
          <p className="text-sm text-muted-foreground">{total ? `${total} reviewed.` : "Nothing needed your attention."}</p>
          <Button render={<Link href="/">Back to overview</Link>} />
        </CardContent>
      </Card>
    );
  }

  const t = current!;
  const merchant = t.merchant_name ?? t.description ?? "Unknown merchant";
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground tabular-nums">{index + 1} of {items.length}</p>
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-4">
            <MerchantAvatar name={merchant} color={colorFor(t.category, categories)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-semibold">{merchant}</p>
              {t.description && t.description !== t.merchant_name && <p className="truncate text-sm text-muted-foreground">{t.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(t.date)}{t.account ? ` · ${t.account}` : ""}{t.plaid_category ? ` · bank says ${humanize(t.plaid_category)}` : ""}
              </p>
            </div>
            <p className={`text-2xl font-semibold tabular-nums ${isCredit(t.amount) ? "text-income" : ""}`}>
              {isCredit(t.amount) ? "+" : ""}{money(t.amount)}
            </p>
          </div>
          {t.category && (
            <p className="text-sm text-muted-foreground">Current guess: <CategoryChip name={t.category} categories={categories} /></p>
          )}
          <Input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories  ( / )" className="h-9" />
          <div className="flex flex-wrap gap-2">
            {visible.map((c, i) => (
              <CategoryChip key={c.id} name={c.name} categories={categories} size="md" onClick={() => pick(c.name)}
                className={i < 9 ? "pl-2" : undefined} />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>1–9 pick · T transfer · S skip · ← back</span>
            <Button variant="ghost" size="sm" onClick={skip} disabled={busy}>Skip</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```
For the first nine chips, prefix the number: render `<span className="mr-1 text-[10px] text-muted-foreground">{i + 1}</span>` inside the chip by extending `CategoryChip` with an optional `hint?: string` prop rendered before the label (add it in `category-chip.tsx`: `{hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}`), and pass `hint={i < 9 ? String(i + 1) : undefined}`.

`Button render={<Link …/>}` follows the base-ui pattern; if this shadcn version's `Button` doesn't accept `render`, use `<Link href="/" className={buttonVariants()}>`.

- [ ] **Step 3: Build + check**

`npm run build`; in dev open `/review`: keyboard 1 picks the first chip, S skips, T sets Transfers, done state appears at the end, sidebar badge decreases after each pick.

- [ ] **Step 4: Commit**

```bash
git add -A web
git commit -m "web: review inbox with keyboard-driven category deck"
```

---

### Task 11: Settings + Accounts polish, docs, deploy

**Files:**
- Modify: `web/components/settings/*.tsx`, `web/components/connect-client.tsx` (use `CategoryChip` where a category name is shown; replace ad-hoc `bg-amber-*` classes with tokens), `docs/architecture.md`, `web/README.md`

- [ ] **Step 1: Token sweep**

`grep -rn "amber-\|emerald-\|text-red\|bg-red" web/components web/app` — replace: income colours → `text-income`; attention highlights → `bg-primary/5` or `border-primary/40`; errors → `text-destructive`. Category names in `rules-panel.tsx` and `mappings-panel.tsx` render via `<CategoryChip name categories />` (these panels already receive `categories`).

- [ ] **Step 2: Docs**

In `docs/architecture.md` under the web bullet add: "Sidebar shell in `app/(app)/layout.tsx`; dark by default via `next-themes`. Overview maths lives in `lib/stats.ts` (Vitest). A single category edit no longer writes a merchant rule; the apply-to-merchant toast (PUT with `apply_to_merchant`) does. Bulk edits use `POST /plaid/transactions/bulk-category`. `/review` is the inbox for uncategorized / ambiguous / nudged transactions." In `web/README.md` add `npm test` (Vitest) and `cd api && .venv/bin/pytest` under a "Tests" heading.

- [ ] **Step 3: Full verification**

```bash
cd api && .venv/bin/pytest -q
cd ../web && npm test && npm run build
```
Manual: dev server, both themes, 375px (device toolbar) and 1440px: Overview, Transactions (select + bulk), Review (keyboard), Categories & rules, Accounts.

- [ ] **Step 4: Deploy**

```bash
cd api && ./deploy.sh
cd ../web && ./deploy.sh
```
Then open https://qolar.app: confirm dark theme, charts populate with real data, change one category and see the toast.

- [ ] **Step 5: Commit + push**

```bash
git add -A
git commit -m "web: token sweep, docs for redesign"
git push origin HEAD
```
