# Qolar — web

Next.js 16 dashboard, served from Vercel at **https://qolar.app**. Sign-in
is Clerk (`@clerk/nextjs` v7). Talks to the API at https://api.qolar.app
(server-side only). Dark by default (`next-themes`), with a sidebar shell in
`app/(app)/layout.tsx`. `/review` is the inbox for uncategorized / ambiguous
/ nudged transactions, worked keyboard-first.

## Auth

`proxy.ts` (Next 16's middleware) runs `clerkMiddleware()`; every page calls
`requireUser()` (`lib/require-user.ts`), which redirects to `/sign-in`. Sign-in
and sign-up pages live at `app/sign-in` / `app/sign-up`.

## How it talks to the API

Server components call the FastAPI backend via `lib/api.ts`, which attaches the
signed-in user's Clerk session JWT as `Authorization: Bearer …`. The API
verifies it against Clerk's JWKS and scopes every query to that user. Client
components go through `app/api/proxy/[...path]` (an allowlisted route handler
that forwards the same token). `API_BASE_URL` is server-side only.

Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (from the Clerk
dashboard, app "Qolar"), `API_BASE_URL`, and the `NEXT_PUBLIC_CLERK_SIGN_*_URL`
vars. Currently on Clerk's dev instance (`pk_test_…`); switch to `pk_live_…`
plus Clerk's DNS records on qolar.app before inviting people.

## Local dev

```
cp .env.example .env.local   # fill in: API_BASE_URL (http://localhost:8000), Clerk keys
npm install
npm run dev -- --port 3100   # 3000 is usually taken on this machine
```

## Tests

```
npm test              # Vitest — lib/stats.ts, lib/category-color.ts, etc.
cd ../api && .venv/bin/pytest
```

## Deploy

```
./deploy.sh
```

Vercel project `qolar-dashboard`, Root Directory `web`, linked at the
monorepo root (`../.vercel`). Env vars live in Vercel project settings;
`API_BASE_URL` must be updated there — and redeployed — whenever the dev
tunnel URL changes.

Don't run plain `vercel --prod` from inside the checkout: this machine's git
`user.email` is a placeholder, and Vercel blocks any deployment whose commit
author it can't match to the account — the CLI then hangs on the blocked
build. `deploy.sh` stages a git-free copy so no author is attached. Git
auto-deploy on push is off for the same reason; fixing `git config
user.email` and connecting GitHub in Vercel account settings would enable it.
