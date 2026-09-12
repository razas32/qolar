import uuid as _uuid

from app.models import MerchantOverride


def test_single_edit_sets_category_without_learning(client, db, category, mk_txn):
    coffee = category("Coffee")
    t = mk_txn()
    r = client.put(f"/plaid/transactions/{t.id}/category", json={"category": "Coffee"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["category"] == "Coffee"
    assert body["category_source"] == "user"
    assert body["merchant_siblings"] == 0
    assert body["applied"] == 0
    assert db.query(MerchantOverride).count() == 0


def test_sibling_count_excludes_user_set_rows(client, category, mk_txn):
    coffee = category("Coffee")
    food = category("Food")
    t = mk_txn(day=1)
    mk_txn(day=2)                                  # auto / unset -> sibling
    mk_txn(day=3, category=food, source="plaid")   # bank guess -> sibling
    mk_txn(day=4, category=food, source="user")    # user-set -> not a sibling
    mk_txn(merchant="Metro", day=5)                # other merchant
    r = client.put(f"/plaid/transactions/{t.id}/category", json={"category": "Coffee"})
    assert r.json()["merchant_siblings"] == 2


def test_apply_to_merchant_learns_and_relabels_siblings(client, db, category, mk_txn):
    coffee = category("Coffee")
    food = category("Food")
    t = mk_txn(day=1)
    a = mk_txn(day=2)
    b = mk_txn(day=3, category=food, source="plaid")
    keep = mk_txn(day=4, category=food, source="user")
    r = client.put(f"/plaid/transactions/{t.id}/category", json={"category": "Coffee", "apply_to_merchant": True})
    assert r.status_code == 200, r.text
    assert r.json()["applied"] == 2
    db.expire_all()
    assert {x.category for x in (db.get(type(a), a.id), db.get(type(b), b.id))} == {"Coffee"}
    assert db.get(type(a), a.id).category_source == "learned"
    assert db.get(type(keep), keep.id).category == "Food"
    ov = db.query(MerchantOverride).one()
    assert ov.merchant_key == "tim hortons" and ov.category_id == coffee.id and ov.source == "user"


def test_unknown_category_400(client, mk_txn):
    t = mk_txn()
    r = client.put(f"/plaid/transactions/{t.id}/category", json={"category": "Nope"})
    assert r.status_code == 400


def test_bulk_sets_only_owned_ids(client, db, category, mk_txn):
    category("Coffee")
    a, b = mk_txn(day=1), mk_txn(day=2)
    stranger = str(_uuid.uuid4())
    r = client.post("/plaid/transactions/bulk-category", json={"transaction_ids": [str(a.id), str(b.id), stranger], "category": "Coffee"})
    assert r.status_code == 200, r.text
    assert r.json() == {"updated": 2}
    db.expire_all()
    assert db.get(type(a), a.id).category_source == "user"
    assert db.get(type(b), b.id).category == "Coffee"


def test_bulk_rejects_over_500(client, category):
    category("Coffee")
    ids = [str(_uuid.uuid4()) for _ in range(501)]
    r = client.post("/plaid/transactions/bulk-category", json={"transaction_ids": ids, "category": "Coffee"})
    assert r.status_code == 422
