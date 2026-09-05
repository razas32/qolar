# Architecture

## Pieces

- **api/** — FastAPI + Postgres. Owns all state. Talks to Plaid (bank data),
  Telegram (nudges), and optionally Anthropic (categorization).
- **web/** — Next.js dashboard on Vercel. Stateless; calls `api/` server-side
  with a setup secret that never reaches the browser. Gated by Basic Auth.
- Local dev: `api/` runs on the laptop behind a Cloudflare quick tunnel so
  Plaid, Telegram, and Vercel can reach it. The tunnel URL changes on every
  restart — update `WEBHOOK_BASE_URL`, re-run Telegram `setWebhook`, and
  update Vercel's `API_BASE_URL`. A VPS with a real domain removes all of this.

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

- Setup endpoints: `X-Qolar-Setup-Secret` (constant-time compare).
- Plaid webhook: JWT signature + body hash verified per request; keys not cached.
- Telegram webhook: secret token header + sender chat-id check.
- Plaid access tokens encrypted at rest (Fernet). Losing `ENCRYPTION_KEY`
  orphans every linked account.
- 64KB request body cap on every route.

## Not yet

Multi-user (everything is single-tenant), `modified`/`removed` transaction
handling, receipt ingestion (email, camera), amount/recurrence signals,
real hosting, mobile app.
