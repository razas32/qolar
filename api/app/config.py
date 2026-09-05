from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str

    plaid_client_id: str
    plaid_secret: str
    plaid_env: str = "production"

    telegram_bot_token: str
    telegram_webhook_secret: str
    # Legacy single-user chat id; only used by scripts/claim_legacy.py now.
    telegram_chat_id: str | None = None

    # Clerk (user auth). JWKS lives at "<frontend api>/.well-known/jwks.json";
    # issuer is the frontend API origin; authorized parties are the origins
    # allowed to mint tokens for this API (comma-separated).
    clerk_jwks_url: str | None = None
    clerk_issuer: str | None = None
    clerk_authorized_parties_raw: str | None = None

    @property
    def clerk_authorized_parties(self) -> list[str]:
        raw = self.clerk_authorized_parties_raw or ""
        return [p.strip() for p in raw.split(",") if p.strip()]

    setup_secret: str
    encryption_key: str

    webhook_base_url: str

    # Optional: enables the LLM merchant-classification and reply-normalization
    # steps. Everything else works without it.
    anthropic_api_key: str | None = None

    # Set by Vercel for scheduled invocations of /cron/*.
    cron_secret: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()
