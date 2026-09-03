import plaid
from plaid.api import plaid_api

from app.config import settings

_ENV_HOSTS = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}

configuration = plaid.Configuration(
    host=_ENV_HOSTS[settings.plaid_env],
    api_key={
        "clientId": settings.plaid_client_id,
        "secret": settings.plaid_secret,
    },
)

client = plaid_api.PlaidApi(plaid.ApiClient(configuration))
