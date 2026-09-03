from fastapi import FastAPI

from app.routers import plaid, telegram

app = FastAPI(title="Loonie")

app.include_router(plaid.router)
app.include_router(telegram.router)


@app.get("/health")
async def health():
    return {"ok": True}
