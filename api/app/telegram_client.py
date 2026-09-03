import httpx

from app.config import settings

TELEGRAM_API = f"https://api.telegram.org/bot{settings.telegram_bot_token}"


async def send_nudge(transaction) -> dict:
    text = (
        f"${transaction.amount} at {transaction.merchant_name} — "
        f"what was this for?"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TELEGRAM_API}/sendMessage",
            json={"chat_id": settings.telegram_chat_id, "text": text},
        )
        resp.raise_for_status()
        return resp.json()["result"]


async def send_text(text: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TELEGRAM_API}/sendMessage",
            json={"chat_id": settings.telegram_chat_id, "text": text},
        )
        resp.raise_for_status()
        return resp.json()["result"]


async def confirm_category(category: str) -> None:
    await send_text(f"Got it, tagged as {category}.")
