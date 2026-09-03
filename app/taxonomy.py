"""Plaid's personal_finance_category taxonomy (the global "what a merchant is"
vocabulary) and the default template mapping those codes onto a user's
categories. The template is copied into category_mappings per user, where
they can rename/lump/split freely without touching the codes themselves.
"""

DEFAULT_CATEGORIES = [
    "Food",
    "Groceries",
    "Shopping",
    "Transport",
    "Fitness",
    "Health",
    "Subscriptions",
    "Entertainment",
    "Housing",
    "Utilities",
    "Travel",
    "Services",
    "Income",
    "Transfers",
    "Bank Fees",
]

# Codes whose merchants are inherently ambiguous by name alone (Amazon,
# Walmart, Costco...). These skip auto-categorization and go to a nudge
# unless the user has set an override.
ASK_CODES = {
    "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES",
    "GENERAL_MERCHANDISE_SUPERSTORES",
    "GENERAL_MERCHANDISE_DEPARTMENT_STORES",
}

# Primary-level fallbacks. Plaid's taxonomy gains detailed codes over time
# (e.g. INCOME_RENTAL wasn't in the published CSV) so every detailed code
# must degrade gracefully to its primary.
_PRIMARY = {
    "INCOME": "Income",
    "TRANSFER_IN": "Transfers",
    "TRANSFER_OUT": "Transfers",
    "LOAN_PAYMENTS": "Transfers",
    "BANK_FEES": "Bank Fees",
    "ENTERTAINMENT": "Entertainment",
    "FOOD_AND_DRINK": "Food",
    "GENERAL_MERCHANDISE": "Shopping",
    "HOME_IMPROVEMENT": "Housing",
    "MEDICAL": "Health",
    "PERSONAL_CARE": "Health",
    "GENERAL_SERVICES": "Services",
    "GOVERNMENT_AND_NON_PROFIT": "Services",
    "TRANSPORTATION": "Transport",
    "TRAVEL": "Travel",
    "RENT_AND_UTILITIES": "Utilities",
}

_DETAILED_OVERRIDES = {
    "FOOD_AND_DRINK_GROCERIES": "Groceries",
    "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS": "Fitness",
    "ENTERTAINMENT_TV_AND_MOVIES": "Subscriptions",
    "ENTERTAINMENT_MUSIC_AND_AUDIO": "Subscriptions",
    "RENT_AND_UTILITIES_RENT": "Housing",
    "RENT_AND_UTILITIES_INTERNET_AND_CABLE": "Subscriptions",
    "RENT_AND_UTILITIES_TELEPHONE": "Subscriptions",
    "GENERAL_SERVICES_INSURANCE": "Services",
    "TRAVEL_LODGING": "Travel",
}

DEFAULT_MAPPING: dict[str, str] = {**_PRIMARY, **_DETAILED_OVERRIDES}


def primary_of(code: str | None) -> str | None:
    """INCOME_RENTAL -> INCOME. Codes are PRIMARY_DETAIL with PRIMARY itself
    possibly containing underscores, so match against known primaries."""
    if not code:
        return None
    for p in sorted(_PRIMARY, key=len, reverse=True):
        if code == p or code.startswith(p + "_"):
            return p
    return None
