import pytest

from claims.store import ClaimError, ClaimStore


def test_create_and_get():
    store = ClaimStore()
    claim = store.create("POL-1", 12_500, "windshield")
    assert claim.id == 1
    assert store.get(1).policy_number == "POL-1"
    assert claim.status == "submitted"


@pytest.mark.parametrize("amount", [0, -5, "100", None, True])
def test_rejects_invalid_amounts(amount):
    with pytest.raises(ClaimError):
        ClaimStore().create("POL-1", amount)


def test_requires_policy_number():
    with pytest.raises(ClaimError):
        ClaimStore().create("  ", 100)


def test_transitions_move_forward_only():
    store = ClaimStore()
    store.create("POL-1", 100)
    assert store.transition(1, "in_review").status == "in_review"
    assert store.transition(1, "approved").status == "approved"
    with pytest.raises(ClaimError) as e:
        store.transition(1, "submitted")
    assert e.value.status == 409


def test_list_filters_by_status():
    store = ClaimStore()
    store.create("POL-1", 100)
    store.create("POL-2", 200)
    store.transition(2, "rejected")
    assert [c.id for c in store.list("rejected")] == [2]
    with pytest.raises(ClaimError):
        store.list("lost")


def test_unknown_claim_is_404():
    with pytest.raises(ClaimError) as e:
        ClaimStore().get(99)
    assert e.value.status == 404
