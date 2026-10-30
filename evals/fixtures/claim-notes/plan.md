---
change: claim-notes
status: approved
spec: ./spec.md
ticket:
risk: high
approved_by: Sam (tech lead)
---
# Plan: Adjusters can leave notes on a claim (from spec.md 2026-10-22)

## Files that change
- `src/claims/store.py` (modified): `Note`, `Claim.notes`, `ClaimStore.add_note`.
- `src/claims/app.py` (modified): `POST /claims/{id}/notes`.
- `tests/test_store.py`, `tests/test_app.py` (modified): R1–R4.

## Work order
1. Tests for `add_note` (valid, blank author/text, > 500 chars, unknown claim) — red.
2. `Note` + `add_note` in the store — green.
3. Route test for R1, R3, R4 — red; route — green.
4. `make lint`, `make test`.

## Risks
- `to_dict` must serialize the notes list (dataclass `asdict` handles nested dataclasses).

## Verification
`make test` covers R1–R4; `make lint` clean.

## Discarded alternatives
- Notes as a separate store keyed by claim id — more code, no benefit in memory.

## Deviations during implementation
