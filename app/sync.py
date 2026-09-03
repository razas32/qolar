from sqlalchemy.orm import Session

from plaid.model.transactions_sync_request import TransactionsSyncRequest

from app.plaid_client import client
from app.models import Item, Transaction
from app.categorize import is_ambiguous, known_category
from app.nudge import maybe_send_nudge

# Deliberately simple for the first slice: only handles `added` transactions.
# `modified` and `removed` are ignored -- a real transaction that gets
# corrected or reversed at the bank won't be reflected here yet. Fine for
# proving the categorization loop; would need handling before this is
# trusted as an accurate ledger.


async def sync_item_transactions(item: Item, db: Session) -> int:
    # Plaid's SDK rejects cursor=None outright -- must be omitted entirely
    # on the first sync rather than passed as null.
    kwargs = {"access_token": item.access_token}
    if item.cursor:
        kwargs["cursor"] = item.cursor
    response = client.transactions_sync(TransactionsSyncRequest(**kwargs))

    added_count = 0
    for added in response.added:
        exists = (
            db.query(Transaction)
            .filter(Transaction.plaid_transaction_id == added.transaction_id)
            .first()
        )
        if exists:
            continue

        ambiguous = is_ambiguous(added.merchant_name)
        transaction = Transaction(
            item_id=item.id,
            plaid_transaction_id=added.transaction_id,
            merchant_name=added.merchant_name,
            amount=added.amount,
            date=added.date,
            is_ambiguous=ambiguous,
            category=None if ambiguous else known_category(added.merchant_name),
        )
        db.add(transaction)
        db.commit()
        db.refresh(transaction)
        added_count += 1

        if ambiguous:
            await maybe_send_nudge(transaction, db)

    item.cursor = response.next_cursor
    db.commit()

    return added_count
