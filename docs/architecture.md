# Architecture

## Pieces

- **api/** — FastAPI + Postgres. Owns all state. Talks to Plaid (bank data),
  Telegram (nudges), and optionally Anthropic (categorization).
- **web/** — Next.js dashboard on Vercel. Stateless; Clerk handles sign-in,
  and every call to `api/` carries the user's Clerk session JWT.
- **Users (since 2026-09-12):** multi-tenant. `users.clerk_user_id` is the
  identity; items, categories, mappings, overrides, synonyms and the Telegram
  chat are all per-user. The API verifies the Clerk JWT (JWKS, `iss`, `azp`)
  in `app/auth.py` and creates the `users` row on first request. Each user
  links their own Telegram chat via a 15-minute `/start <code>` deep link
  (`/me/telegram/link-code`). Legacy single-user data was moved onto the
  owner's account with `scripts/claim_legacy.py`.
- **Hosting (since 2026-09-05):** everything is on Vercel, no laptop involved.
  - `api/` → Vercel project `qolar-api`, zero-config FastAPI (entrypoint
    `app/main.py`), Python 3.13, at **https://api.qolar.app**. Daily
    `/cron/sync` (Vercel Cron, `CRON_SECRET`) is the fallback for Plaid's
    webhook. Deploy with `api/deploy.sh`.
  - Postgres → **Neon** via the Vercel Marketplace (free tier, `us-east-1` —
    not Canada; upgrade to a Canadian-region DB before real users' data
    matters). `DATABASE_URL` is injected into the project. Migrations run from
    a dev machine: `DATABASE_URL=<neon unpooled url> alembic upgrade head`.
  - `web/` → Vercel project `loonie-dashboard` (name is historical) at
    **https://qolar.app**. Deploy with `web/deploy.sh`.
  - DNS is on Cloudflare: `A qolar.app 76.76.21.21` and `A api.qolar.app
    76.76.21.21`, both **DNS-only** (proxy off, or Vercel can't issue certs).
  - When the API URL changes: update `WEBHOOK_BASE_URL` (api project) and
    `API_BASE_URL` (web project), redeploy both, re-run Telegram `setWebhook`,
    and `python -m scripts.update_webhooks` for existing Plaid items.
- Local dev still runs `api/` on `localhost:8000` against a local Postgres;
  `web/.env.local` points at it. Webhooks don't reach local dev — use
  `scripts/sync_now.py` and the manual nudge paths instead of a tunnel.

## Data flow

```
Plaid webhook ──▶ api /plaid/webhook ──▶ transactions_sync (cursor)
                                            │
                                            ▼
                                   categorize.decide()
                                     │            │
                               decided        ask ──▶ Telegram nudge
                                                          │ reply
                                                          ▼
                                                   resolve_nudge()
                                                   learn override
```

`scripts/sync_now.py` runs the same path manually (Plaid's webhook has been
unreliable in dev). `scripts/recategorize.py` re-runs the ladder over
existing rows after rules or mappings change.

## Categorization: two kinds of knowledge

| Table | Scope | Holds | Written by |
|---|---|---|---|
| `merchant_types` | **global** | merchant → Plaid taxonomy code + confidence | Plaid (HIGH tag), one LLM call, or user confirmation |
| `categories` | per user | the user's category names | user |
| `category_mappings` | per user | Plaid code → user category | seeded from `taxonomy.DEFAULT_MAPPING`, edited by user |
| `merchant_overrides` | per user | merchant → category, or `always_ask` | user (`source=user`) or a nudge answer (`source=learned`) |
| `reply_synonyms` | per user | reply phrase → category | first LLM normalization of that phrase |

Consequences:
- Renaming/lumping categories rewrites `category_mappings` only. No model call.
- A merchant is classified once, ever, for everyone. LLM cost is per *new
  merchant*, trending to zero.
- `ASK_CODES` (online marketplaces, superstores, department stores) always
  ask unless overridden — Amazon/Walmart/Costco without naming them.
- User overrides outrank learned ones; learned ones never overwrite user ones.

## Ladder (`api/app/categorize.py`)

```
override(user) → override(learned) → merchant_type ∘ mapping → LLM → ask
```
LOW-confidence results at any step fall through. The LLM (`claude-opus-5`,
structured outputs) is optional — without `ANTHROPIC_API_KEY`, step 4 is
skipped and nudge replies must roughly match a category name.

## Security posture (dev)

- All user endpoints: Clerk RS256 JWT, verified against `CLERK_JWKS_URL`,
  issuer + authorized parties checked. Cron: `Authorization: Bearer $CRON_SECRET`.
- Plaid webhook: JWT signature + body hash verified per request; keys not cached.
- Telegram webhook: secret token header + sender chat-id check.
- Plaid access tokens encrypted at rest (Fernet). Losing `ENCRYPTION_KEY`
  orphans every linked account.
- 64KB request body cap on every route.

## Not yet

Multi-user (everything is single-tenant), `modified`/`removed` transaction
handling, receipt ingestion (email, camera), amount/recurrence signals,
real hosting, mobile app.
