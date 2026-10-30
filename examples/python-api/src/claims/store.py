"""In-memory claim store. The SQL in migrations/ documents the production schema."""

from __future__ import annotations

import itertools
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime

STATUSES = ("submitted", "in_review", "approved", "rejected", "paid")

# Allowed status transitions: a claim only moves forward, and rejected/paid are final.
TRANSITIONS: dict[str, tuple[str, ...]] = {
    "submitted": ("in_review", "rejected"),
    "in_review": ("approved", "rejected"),
    "approved": ("paid",),
    "rejected": (),
    "paid": (),
}


class ClaimError(Exception):
    """A request the API rejects with 4xx."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class Claim:
    id: int
    policy_number: str
    amount_cents: int
    description: str
    status: str = "submitted"
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class ClaimStore:
    def __init__(self) -> None:
        self._claims: dict[int, Claim] = {}
        self._ids = itertools.count(1)

    def create(self, policy_number: str, amount_cents: int, description: str = "") -> Claim:
        if not policy_number or not policy_number.strip():
            raise ClaimError("policy_number is required")
        if not isinstance(amount_cents, int) or isinstance(amount_cents, bool) or amount_cents <= 0:
            raise ClaimError("amount_cents must be a positive integer")
        claim = Claim(
            id=next(self._ids), policy_number=policy_number.strip(), amount_cents=amount_cents, description=description
        )
        self._claims[claim.id] = claim
        return claim

    def get(self, claim_id: int) -> Claim:
        claim = self._claims.get(claim_id)
        if claim is None:
            raise ClaimError(f"claim {claim_id} not found", status=404)
        return claim

    def list(self, status: str | None = None) -> list[Claim]:
        if status is not None and status not in STATUSES:
            raise ClaimError(f"unknown status {status!r}")
        return [c for c in self._claims.values() if status is None or c.status == status]

    def transition(self, claim_id: int, new_status: str) -> Claim:
        claim = self.get(claim_id)
        if new_status not in STATUSES:
            raise ClaimError(f"unknown status {new_status!r}")
        if new_status not in TRANSITIONS[claim.status]:
            raise ClaimError(f"cannot move a claim from {claim.status} to {new_status}", status=409)
        claim.status = new_status
        return claim
