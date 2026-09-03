"""Deliberately dumb for the first slice: a hardcoded list of merchants whose
category can't be inferred from the name alone. Everything else passes
through uncategorized without triggering a nudge — proving the loop matters
more than the categorization intelligence at this stage.
"""

AMBIGUOUS_MERCHANTS = {
    "amazon",
    "walmart",
    "costco",
    "target",
}


def is_ambiguous(merchant_name: str | None) -> bool:
    if not merchant_name:
        return False
    return merchant_name.strip().lower() in AMBIGUOUS_MERCHANTS
