import json

from claims import __version__
from claims.app import App


def call(app, method, path, body=None):
    status, data = app.handle(method, path, json.dumps(body).encode() if body is not None else b"")
    return status, data


def test_health():
    assert call(App(), "GET", "/health") == (200, {"status": "ok", "version": __version__})


def test_create_list_and_change_status():
    app = App()
    status, claim = call(app, "POST", "/claims", {"policy_number": "POL-7", "amount_cents": 9900})
    assert status == 201
    assert call(app, "GET", f"/claims/{claim['id']}")[1]["policy_number"] == "POL-7"
    assert call(app, "POST", f"/claims/{claim['id']}/status", {"status": "in_review"})[1]["status"] == "in_review"
    assert [c["id"] for c in call(app, "GET", "/claims?status=in_review")[1]] == [claim["id"]]


def test_errors_are_json():
    app = App()
    assert call(app, "POST", "/claims", {"policy_number": "POL-7", "amount_cents": -1})[0] == 400
    assert call(app, "GET", "/claims/42")[0] == 404
    assert call(app, "DELETE", "/claims")[0] == 404
    assert app.handle("POST", "/claims", b"{nope")[0] == 400
