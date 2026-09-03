"""The two -- and only two -- places a model is consulted:

1. classify_merchant: "what is this business?" -> a Plaid taxonomy code.
   Global fact, cached forever in merchant_types, so each merchant costs
   one call across the whole userbase.
2. normalize_reply: map a free-text nudge reply ("gym sesh") onto one of the
   user's own category names. Cached per phrase in reply_synonyms.

Both are skipped cleanly when no API key is configured.
"""

from typing import Literal

import anthropic
from pydantic import BaseModel

from app.config import settings
from app.taxonomy import DEFAULT_MAPPING, primary_of

MODEL = "claude-opus-5"

_client: anthropic.Anthropic | None = None


def is_enabled() -> bool:
    return bool(settings.anthropic_api_key)


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


class MerchantClassification(BaseModel):
    plaid_code: str
    confidence: Literal["HIGH", "MEDIUM", "LOW"]
    reasoning: str


class ReplyNormalization(BaseModel):
    category: str | None
    confidence: Literal["HIGH", "MEDIUM", "LOW"]


_CODES_TEXT = "\n".join(sorted(DEFAULT_MAPPING))


def classify_merchant(merchant_name: str | None, description: str | None) -> tuple[str, str] | None:
    """Return (plaid_code, confidence) or None if disabled/unusable."""
    if not is_enabled():
        return None

    response = _get_client().messages.parse(
        model=MODEL,
        max_tokens=1024,
        output_config={"effort": "low"},
        system=(
            "You classify bank transaction merchants into Plaid's personal-finance "
            "taxonomy. Choose the single most specific code that applies. Use a "
            "detailed code (PRIMARY_DETAIL) when the business type is clear; fall "
            "back to the PRIMARY code when only the broad type is clear. Report "
            "LOW confidence when the name is uninformative or the merchant could "
            "plausibly be several unrelated things.\n\nValid codes:\n" + _CODES_TEXT
        ),
        messages=[{
            "role": "user",
            "content": f"Merchant name: {merchant_name or '(none)'}\nBank description: {description or '(none)'}",
        }],
        output_format=MerchantClassification,
    )
    result = response.parsed_output
    if result is None or primary_of(result.plaid_code) is None:
        return None
    return result.plaid_code, result.confidence


def normalize_reply(reply: str, category_names: list[str]) -> str | None:
    """Map a free-text reply to one of the user's category names, or None."""
    if not is_enabled():
        return None

    response = _get_client().messages.parse(
        model=MODEL,
        max_tokens=512,
        output_config={"effort": "low"},
        system=(
            "A user was asked what a bank transaction was for and replied in "
            "free text. Map the reply onto exactly one of their categories, or "
            "null if none fits. Prefer a category over null when the intent is "
            "reasonably clear (e.g. 'gym sesh' -> Fitness, 'rent' -> Housing). "
            "Categories:\n" + "\n".join(category_names)
        ),
        messages=[{"role": "user", "content": reply}],
        output_format=ReplyNormalization,
    )
    result = response.parsed_output
    if result is None or result.category not in category_names or result.confidence == "LOW":
        return None
    return result.category
