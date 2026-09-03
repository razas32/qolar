from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.routers import plaid, telegram

app = FastAPI(title="Loonie")

# All bodies this service ever expects (webhook payloads, setup calls) are a
# handful of small JSON fields. Reject anything bigger before it's read into
# memory, so a stranger who finds a public URL can't use an oversized POST to
# exhaust memory.
MAX_REQUEST_BODY_BYTES = 64_000


@app.middleware("http")
async def limit_request_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length is not None and int(content_length) > MAX_REQUEST_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "request body too large"})
    return await call_next(request)


app.include_router(plaid.router)
app.include_router(telegram.router)


@app.get("/health")
async def health():
    return {"ok": True}
