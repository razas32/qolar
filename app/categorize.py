"""Deliberately dumb for the first slice: a hardcoded ambiguous-merchant list
that triggers a nudge, and a hardcoded known-merchant map that doesn't. Real
categorization intelligence (fuzzy matching, ML, user-specific learning) is
out of scope until the loop itself is proven out.
"""

AMBIGUOUS_MERCHANTS = {
    "amazon",
    "walmart",
    "costco",
    "target",
}

KNOWN_MERCHANTS = {
    "tim hortons": "Food",
    "starbucks": "Food",
    "mcdonald's": "Food",
    "uber": "Transportation",
    "netflix": "Subscriptions",
    "spotify": "Subscriptions",
}


def is_ambiguous(merchant_name: str | None) -> bool:
    if not merchant_name:
        return False
    return merchant_name.strip().lower() in AMBIGUOUS_MERCHANTS


def known_category(merchant_name: str | None) -> str | None:
    if not merchant_name:
        return None
    return KNOWN_MERCHANTS.get(merchant_name.strip().lower())
