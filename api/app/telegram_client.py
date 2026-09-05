import httpx

from app.config import settings

TELEGRAM_API = f"https://api.telegram.org/bot{settings.telegram_bot_token}"


async def send_text(chat_id: str, text: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TELEGRAM_API}/sendMessage",
            json={"chat_id": chat_id, "text": text},
        )
        resp.raise_for_status()
        return resp.json()["result"]


async def bot_username() -> str | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{TELEGRAM_API}/getMe")
        if resp.status_code != 200:
            return None
        return resp.json().get("result", {}).get("username")
