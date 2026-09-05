# Qolar

Canada-first personal finance. Bank transactions come in through Plaid, get
categorized automatically, and the app only asks you about the ones it
genuinely can't figure out — over Telegram, in plain language.

```
api/    FastAPI + Postgres. Plaid sync, the categorization ladder, Telegram nudges.
web/    Next.js dashboard (Vercel). Read-only view of transactions + categories.
docs/   Design notes.
```

Each folder has its own README with setup steps. Start with `api/`.

## How categorization works (short version)

Cheapest signal first, stop at the first hit:

1. your override for that merchant
2. a learned override (from a previous answer)
3. what the merchant *is* (Plaid's tag, or one cached LLM lookup) → mapped through *your* category names
4. LLM guess, if nobody has ever seen this merchant
5. ask you on Telegram

Facts about merchants are global and shared; what you call things is yours.
See `docs/architecture.md`.
