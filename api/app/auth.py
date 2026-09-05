"""Who is calling?

Two kinds of caller:
- A person, via the dashboard: `Authorization: Bearer <Clerk session JWT>`.
  Verified against Clerk's JWKS (RS256), exp/nbf checked, `azp` restricted to
  our known origins. `sub` is the Clerk user id; we map it to a `users` row
  (created on first sight).
- Ourselves, via scripts / admin tooling: `X-Qolar-Setup-Secret`. Kept for
  operations that aren't tied to a person (webhook re-registration, backfills).

Webhooks (Plaid, Telegram) authenticate differently and never go through here.
"""

import hmac
from datetime import datetime

import jwt
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User

_jwks_client: jwt.PyJWKClient | None = None


def _jwks() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not settings.clerk_jwks_url:
            raise HTTPException(status_code=503, detail="auth not configured")
        _jwks_client = jwt.PyJWKClient(settings.clerk_jwks_url, cache_keys=True)
    return _jwks_client


def verify_clerk_token(token: str) -> dict:
    try:
        signing_key = _jwks().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            options={"require": ["exp", "sub"], "verify_aud": False},
            leeway=10,
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"invalid session: {e.__class__.__name__}")

    if settings.clerk_issuer and claims.get("iss") != settings.clerk_issuer:
        raise HTTPException(status_code=401, detail="invalid session issuer")

    # azp = the origin that minted the token. Restricting it stops a token
    # issued for some other Clerk app on the same instance being replayed here.
    azp = claims.get("azp")
    allowed = settings.clerk_authorized_parties
    if allowed and azp not in allowed:
        raise HTTPException(status_code=401, detail="invalid session origin")
    return claims


def get_or_create_user(db: Session, clerk_user_id: str) -> User:
    user = db.query(User).filter(User.clerk_user_id == clerk_user_id).first()
    if user is None:
        user = User(clerk_user_id=clerk_user_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.last_seen_at = datetime.utcnow()
        db.commit()
    return user


async def current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str = Header(default=""),
) -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="sign in required")
    claims = verify_clerk_token(token)
    user = get_or_create_user(db, claims["sub"])
    request.state.user = user
    return user


async def require_setup_secret(x_qolar_setup_secret: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_qolar_setup_secret, settings.setup_secret):
        raise HTTPException(status_code=403, detail="invalid setup secret")
