from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str

    plaid_client_id: str
    plaid_secret: str
    plaid_env: str = "production"

    telegram_bot_token: str
    telegram_chat_id: str

    class Config:
        env_file = ".env"


settings = Settings()
