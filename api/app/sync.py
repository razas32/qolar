from sqlalchemy.orm import Session

from plaid.model.transactions_sync_request import TransactionsSyncRequest

from app.plaid_client import client
from app.models import Item, Transaction
from app import categorize
from app.nudge import maybe_send_nudge
from app.transfers import match_transfers

# First slice: only `added` is persisted. `modified`/`removed` are ignored,
# so a bank-side correction or reversal won't be reflected yet.


def _fill_plaid_fields(txn: Transaction, added) -> None:
    pfc = added.personal_finance_category
    txn.account_id = added.account_id
    txn.description = added.name
    txn.pending = bool(added.pending)
    txn.plaid_category_primary = pfc.primary if pfc else None
    txn.plaid_category_detailed = pfc.detailed if pfc else None
    txn.plaid_confidence = getattr(pfc, "confidence_level", None) if pfc else None


async def sync_item_transactions(item: Item, db: Session, *, send_nudges: bool = True) -> int:
    user = item.user
    categorize.seed_defaults(db, user)

    # Plaid's SDK rejects cursor=None outright -- must be omitted on first sync.
    kwargs = {"access_token": item.access_token}
    if item.cursor:
        kwargs["cursor"] = item.cursor
    response = client.transactions_sync(TransactionsSyncRequest(**kwargs))

    added_count = 0
    to_ask: list[Transaction] = []
    for added in response.added:
        txn = (
            db.query(Transaction)
            .filter(Transaction.plaid_transaction_id == added.transaction_id)
            .first()
        )
        if txn:
            if txn.plaid_category_detailed is None:
                _fill_plaid_fields(txn, added)
                db.commit()
            continue

        txn = Transaction(
            item_id=item.id,
            plaid_transaction_id=added.transaction_id,
            merchant_name=added.merchant_name,
            amount=added.amount,
            date=added.date,
        )
        _fill_plaid_fields(txn, added)
        db.add(txn)
        db.flush()

        decision = categorize.decide(db, user, txn)
        categorize.apply(db, txn, decision)
        db.commit()
        db.refresh(txn)
        added_count += 1
        if decision.ask:
            to_ask.append(txn)

    # A new row may be the other side of a transfer we already hold (or vice
    # versa). Match before asking, so an autopay never becomes a question.
    if added_count:
        match_transfers(db, user)

    if send_nudges:
        for txn in to_ask:
            db.refresh(txn)
            if txn.is_ambiguous:
                await maybe_send_nudge(db, user, txn)

    item.cursor = response.next_cursor
    db.commit()
    return added_count
