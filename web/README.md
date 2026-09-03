# Loonie — web

Next.js 16 dashboard. Read-only view of transactions and categories, served
from Vercel at https://loonie-dashboard.vercel.app behind HTTP Basic Auth.

## How it talks to the API

A server component (`app/page.tsx`) calls `GET /plaid/transactions` on the
FastAPI backend using two **server-side** env vars — `API_BASE_URL` and
`SETUP_SECRET` — via `lib/api.ts`. Neither is ever sent to the browser.

`proxy.ts` (Next 16's middleware) gates every route with Basic Auth
(`DASHBOARD_USER` / `DASHBOARD_PASSWORD`) and fails closed if unset, since a
Vercel deploy is public by default and this page shows real bank data.

## Local dev

```
cp .env.example .env.local   # fill in: API_BASE_URL (tunnel), SETUP_SECRET (from api/.env), user/password
npm install
npm run dev -- --port 3100   # 3000 is usually taken on this machine
```

## Deploy

```
./deploy.sh
```

Vercel project `loonie-dashboard`, Root Directory `web`, linked at the
monorepo root (`../.vercel`). Env vars live in Vercel project settings;
`API_BASE_URL` must be updated there — and redeployed — whenever the dev
tunnel URL changes.

Don't run plain `vercel --prod` from inside the checkout: this machine's git
`user.email` is a placeholder, and Vercel blocks any deployment whose commit
author it can't match to the account — the CLI then hangs on the blocked
build. `deploy.sh` stages a git-free copy so no author is attached. Git
auto-deploy on push is off for the same reason; fixing `git config
user.email` and connecting GitHub in Vercel account settings would enable it.
