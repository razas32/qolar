def test_categories_have_stable_color_index(client, category):
    category("Coffee")
    category("Groceries")
    first = {c["name"]: c["color_index"] for c in client.get("/categories").json()}
    second = {c["name"]: c["color_index"] for c in client.get("/categories").json()}
    assert first == second
    assert all(0 <= i < 12 for i in first.values())
