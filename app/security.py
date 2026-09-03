"""Auth for the two things this service exposes on a public tunnel:

1. Setup endpoints (/plaid/link-token, /plaid/exchange-token) — only you
   should ever be able to trigger these, so they require a shared secret
   you set yourself.
2. Webhooks (/plaid/webhook, /telegram/webhook) — these are called by
   Plaid/Telegram, not by you, so they're verified with each provider's
   own signing mechanism instead of your secret.
"""

import hashlib
import json
import time

import jwt
from fastapi import Header, HTTPException, Request

from app.config import settings
from app.plaid_client import client

from plaid.model.webhook_verification_key_get_request import WebhookVerificationKeyGetRequest

_jwk_cache: dict[str, dict] = {}


async def require_setup_secret(x_loonie_setup_secret: str = Header(default="")) -> None:
    if x_loonie_setup_secret != settings.setup_secret:
        raise HTTPException(status_code=403, detail="invalid setup secret")


async def require_telegram_secret(
    x_telegram_bot_api_secret_token: str = Header(default=""),
) -> None:
    if x_telegram_bot_api_secret_token != settings.telegram_webhook_secret:
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

    raw_body = await request.body()

    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="malformed webhook token")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=403, detail="missing kid in webhook token")

    jwk = _jwk_cache.get(kid)
    if jwk is None:
        key_response = client.webhook_verification_key_get(
            WebhookVerificationKeyGetRequest(key_id=kid)
        )
        jwk = key_response.key.to_dict()
        _jwk_cache[kid] = jwk

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
