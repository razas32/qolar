# Qolar

Prototype: Plaid → Postgres → Telegram nudge loop for ambiguous-merchant categorization.

First slice only — no email/camera ingestion, no billing, no mobile app yet.
Goal is to prove the core mechanic: when a transaction comes from a merchant
whose category can't be guessed from the name (Amazon, Walmart, Costco,
Target), the bot asks what it was for over Telegram, and the reply updates
the transaction.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `PLAID_CLIENT_ID` / `PLAID_SECRET` from your Plaid dashboard (Production
     environment — you're on the free trial with up to 10 live connections)
   - `TELEGRAM_BOT_TOKEN` — create a bot via [@BotFather](https://t.me/BotFather),
     `/newbot`, copy the token
   - `TELEGRAM_WEBHOOK_SECRET` — a random string (`openssl rand -hex 32`) so
     only Telegram can hit the bot webhook
   - `CLERK_JWKS_URL` / `CLERK_ISSUER` — from the Clerk dashboard (API keys →
     Frontend API URL; JWKS is `<issuer>/.well-known/jwks.json`)
   - `CLERK_AUTHORIZED_PARTIES_RAW` — comma-separated origins allowed to call
     the API, e.g. `https://qolar.app,http://localhost:3100`
   - `ENCRYPTION_KEY` — generate with
     `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
     — encrypts the Plaid access token at rest in Postgres

2. Run it. Docker Compose (`docker-compose.yml`) is provided, but this was
   actually developed and verified running **locally** (no Docker installed
   on the dev machine), via:
   ```
   brew install postgresql@16 && brew services start postgresql@16
   psql postgres -c "CREATE USER qolar WITH PASSWORD 'qolar';"
   psql postgres -c "CREATE DATABASE qolar OWNER qolar;"

   python3.13 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt

   alembic upgrade head
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   If running locally (not Docker), `DATABASE_URL` in `.env` should point at
   `localhost`, not `db`:
   `postgresql+psycopg2://qolar:qolar@localhost:5432/qolar`

   Note: `psycopg2-binary` needs a version with a prebuilt wheel for your
   Python version — 2.9.9 has none for Python 3.13/3.14 on macOS arm64 and
   fails building from source; 2.9.12 works. If `pip install` fails building
   psycopg2, bump the pin in `requirements.txt`.

3. Webhooks (Plaid, Telegram) point at production — **https://api.qolar.app**
   — not at local dev. Local dev pulls data with `python3 -m scripts.sync_now`
   instead. To (re)register after the API URL changes:
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.qolar.app/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   WEBHOOK_BASE_URL=https://api.qolar.app DATABASE_URL=<neon url> python3 -m scripts.update_webhooks
   ```

## Testing

`pytest` and other dev-only tooling live in `requirements-dev.txt`, not in
the runtime `requirements.txt` that ships to production. Install and run:
```
pip install -r requirements-dev.txt
pytest -q
```
Tests require a local Postgres (see Setup) and refuse to run against
anything else — `conftest.py` checks the host and database name before
creating the test database.

## Production (Vercel + Neon)

- Vercel project `qolar-api`; FastAPI is auto-detected from `app/main.py`,
  Python 3.13 from `.python-version`. Config in `vercel.json` (cron, bundle
  excludes). Deploy: `./deploy.sh` (stages a git-free copy — see the comment
  in the script for why).
- Database: Neon Postgres from the Vercel Marketplace; `DATABASE_URL` is set
  on the project automatically. `vercel env pull .env.local` gives you the
  connection strings locally. Run migrations against it explicitly:
  `DATABASE_URL=<DATABASE_URL_UNPOOLED from .env.local> .venv/bin/alembic upgrade head`
- All other secrets are Vercel env vars (`vercel env ls production`).
- `/cron/sync` runs daily (Hobby plan minimum) as the fallback for Plaid's
  transactions webhook.

4. Link an account: sign in to the dashboard and use **Connect**. Every
   `/plaid/*`, `/categories`, `/rules`, `/me` endpoint requires a Clerk
   session JWT as `Authorization: Bearer …`; the dashboard attaches it for you.

At that point new transactions from ambiguous merchants should trigger a
Telegram message, and replying should update the transaction's category.

## Notes

- Plaid Python SDK APIs shift between versions — already caught one: this
  SDK version has no `plaid.Environment.Development` (Plaid deprecated the
  separate Development tier; Free Trial now runs on Production with a
  10-item cap). If `plaid_client.py`, `routers/plaid.py`, or the webhook
  verification in `security.py` throw on unfamiliar method/model names,
  check the installed `plaid-python` version's docs rather than assuming
  this code is current.
- `items.access_token` is encrypted at rest (Fernet, via `app/crypto.py`) —
  losing `ENCRYPTION_KEY` makes all stored tokens unrecoverable, so back it
  up somewhere other than just `.env` once this holds a real linked account.
- `resolve_nudge` assumes a single user / single open nudge at a time — fine
  for solo prototyping, would need real matching (e.g. by Telegram message
  thread) before more than one person uses this.

## Categorization

`app/categorize.py` walks a ladder, cheapest signal first, and stops at the
first hit: user override → learned override → merchant type (Plaid's tag, or
a cached LLM lookup) mapped through the user's `category_mappings` → LLM
classification → ask via Telegram. Two kinds of knowledge are kept apart:

- **Global facts** (`merchant_types`): what a merchant *is*, as a Plaid
  taxonomy code. Shared across users; each merchant is classified once, ever.
- **Per-user preferences** (`categories`, `category_mappings`,
  `merchant_overrides`, `reply_synonyms`): what *you* call it. Renaming or
  lumping categories rewrites the mapping and never re-consults a model.

Plaid codes in `ASK_CODES` (online marketplaces, superstores) always ask
unless an override exists — that's Amazon/Walmart/Costco without hardcoding.

The LLM (`app/llm.py`, `claude-opus-5`) is optional: set `ANTHROPIC_API_KEY`
to enable merchant classification and free-text reply normalization. Without
it, replies must roughly match a category name.

- `python3 -m scripts.recategorize [--nudge]` — seed defaults and re-run the
  ladder over everything not already user/nudge-categorized. Prints a
  before/after and lists what still needs a nudge.
