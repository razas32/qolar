"""Auth for the two things this service exposes on a public tunnel:

1. Setup endpoints (/plaid/link-token, /plaid/exchange-token) — only you
   should ever be able to trigger these, so they require a shared secret
   you set yourself.
2. Webhooks (/plaid/webhook, /telegram/webhook) — these are called by
   Plaid/Telegram, not by you, so they're verified with each provider's
   own signing mechanism instead of your secret.
"""

import hashlib
import hmac
import json
import time

import jwt
from fastapi import Header, HTTPException, Request

from app.config import settings
from app.plaid_client import client

from plaid.model.webhook_verification_key_get_request import WebhookVerificationKeyGetRequest

# Plaid webhook bodies are a handful of small JSON fields (item_id,
# webhook_type, etc) — a few KB is generous headroom. Anything bigger is
# either not a real Plaid webhook or an attempt to exhaust memory before
# signature verification even runs.
MAX_WEBHOOK_BODY_BYTES = 64_000


async def require_setup_secret(x_qolar_setup_secret: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_qolar_setup_secret, settings.setup_secret):
        raise HTTPException(status_code=403, detail="invalid setup secret")


async def require_telegram_secret(
    x_telegram_bot_api_secret_token: str = Header(default=""),
) -> None:
    if not hmac.compare_digest(x_telegram_bot_api_secret_token, settings.telegram_webhook_secret):
        raise HTTPException(status_code=403, detail="invalid telegram webhook secret")


async def verify_plaid_webhook(request: Request) -> dict:
    """Verify the Plaid-Verification JWT and body hash, per Plaid's webhook
    verification docs. Raises 403 on any failure. Returns the parsed body.

    NOTE: Plaid's SDK surface for this shifts between versions — if
    `WebhookVerificationKeyGetRequest` or `webhook_verification_key_get`
    don't exist on your installed plaid-python, check current Plaid docs
    for the renamed equivalent rather than assuming this is still correct.
    """
    token = request.headers.get("Plaid-Verification")
    if not token:
        raise HTTPException(status_code=403, detail="missing Plaid-Verification header")

    content_length = request.headers.get("content-length")
    if content_length is None or int(content_length) > MAX_WEBHOOK_BODY_BYTES:
        raise HTTPException(status_code=413, detail="webhook body too large")

    raw_body = await request.body()
    if len(raw_body) > MAX_WEBHOOK_BODY_BYTES:
        raise HTTPException(status_code=413, detail="webhook body too large")

    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="malformed webhook token")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=403, detail="missing kid in webhook token")

    # Deliberately not cached: caching would keep trusting a key across its
    # whole process lifetime even after Plaid rotates/revokes it. Traffic
    # here is low-volume enough that fetching fresh each time is cheap and
    # avoids that staleness bug entirely.
    key_response = client.webhook_verification_key_get(
        WebhookVerificationKeyGetRequest(key_id=kid)
    )
    jwk = key_response.key.to_dict()
    if jwk.get("expired_at"):
        raise HTTPException(status_code=403, detail="webhook signing key has been rotated out")

    try:
        signing_key = jwt.PyJWK.from_json(json.dumps(jwk)).key
        claims = jwt.decode(token, signing_key, algorithms=["ES256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="invalid webhook signature")

    # Reject stale webhooks (replay protection) — 5 minute window per Plaid docs.
    if time.time() - claims.get("iat", 0) > 300:
        raise HTTPException(status_code=403, detail="stale webhook")

    expected_hash = hashlib.sha256(raw_body).hexdigest()
    if claims.get("request_body_sha256") != expected_hash:
        raise HTTPException(status_code=403, detail="body hash mismatch")

    return json.loads(raw_body)
