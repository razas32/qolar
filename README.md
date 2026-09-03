# Loonie

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
   - `TELEGRAM_CHAT_ID` — message your new bot once, then hit
     `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your chat id
   - `TELEGRAM_WEBHOOK_SECRET` / `SETUP_SECRET` — make up two random strings
     (e.g. `openssl rand -hex 32`) — these keep strangers who find your ngrok
     URL from triggering your setup endpoints or spoofing bot replies

2. Start it:
   ```
   docker compose up --build
   ```

3. Tunnel it for Plaid/Telegram webhooks during local dev:
   ```
   ngrok http 8000
   ```
   Then set the ngrok URL + `/plaid/webhook` as your webhook in the Plaid
   dashboard, and register the Telegram webhook with the secret token so
   Telegram signs its calls (must match `TELEGRAM_WEBHOOK_SECRET` in `.env`):
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<ngrok-url>/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

4. Run migrations:
   ```
   docker compose exec api alembic revision --autogenerate -m "init"
   docker compose exec api alembic upgrade head
   ```

5. Link an account: call `POST /plaid/link-token` and `POST /plaid/exchange-token`
   with header `X-Loonie-Setup-Secret: <SETUP_SECRET>`. Use the returned
   `link_token` with Plaid's hosted Link flow (or Plaid's quickstart HTML) to
   get a `public_token` for the exchange call.

At that point new transactions from ambiguous merchants should trigger a
Telegram message, and replying should update the transaction's category.

## Notes

- Plaid Python SDK APIs shift between versions — if `plaid_client.py`,
  `routers/plaid.py`, or the webhook verification in `security.py` throw on
  unfamiliar method/model names, check the installed `plaid-python` version's
  docs rather than assuming this code is current.
- Access tokens are stored in plaintext in Postgres (`items.access_token`).
  Fine for a local prototype; encrypt at rest before this ever runs anywhere
  else, or before more than one person's bank data lives in this database.
- `resolve_nudge` assumes a single user / single open nudge at a time — fine
  for solo prototyping, would need real matching (e.g. by Telegram message
  thread) before more than one person uses this.
