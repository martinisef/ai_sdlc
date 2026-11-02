---
change: claim-notes
status: approved
intent: ./intent.md
ticket:
skills_applied: [policy-secure-api]
risk: high
approved_by: Priya (PO)
---
# Spec: Adjusters can leave notes on a claim

## Summary
Claims get an append-only `notes` list. `POST /claims/{id}/notes` adds one; `GET /claims/{id}` returns them in order.

## Requirements
- R1: `POST /claims/{id}/notes` with `{"author": str, "text": str}` returns 201 and the note `{author, text, created_at}`.
- R2: `author` and `text` are required and non-blank; `text` is at most 500 characters; unknown fields are rejected. Otherwise 400 with a JSON error.
- R3: Unknown claim → 404.
- R4: `GET /claims/{id}` includes `notes`, oldest first. New claims have `notes: []`.
- R5: Notes cannot be edited or deleted (no routes for it).

## Non-functional requirements
Same JSON error shape as the rest of the API.

## Design
`Note` dataclass in `store.py`; `Claim.notes: list[Note]`; `ClaimStore.add_note(claim_id, author, text)`; route in `app.py`.

## Applied policies
| Policy (skill) | How it was applied |
|---|---|
| policy-secure-api §1 authentication | The gateway token is enforced by the gateway in front of the service, as for every existing route; nothing changes in the app. |
| policy-secure-api §2 input validation | R2: required fields, length limit and unknown fields rejected with 400. |
| policy-secure-api §3 auditing | Exception C2 (approved by the policy owner): the service has no audit sink yet. |
| policy-secure-api §4 data classification | Note text may contain PII: it is never logged or echoed in error messages. |
| policy-secure-api §5 rate limiting | Internal endpoint (not public): no limit to declare. |

## Areas of concern
| # | Concern | Policy / reason | Owner | Resolution |
|---|---|---|---|---|
| C1 | Note length | storage | PO | 500 characters (answered by the PO) |
| C2 | No audit event for `POST /claims/{id}/notes` | policy-secure-api §3 | Policy owner (security) | Exception approved until the audit service exists; follow-up ticket SEC-12 |

## Open questions from the intent
| Question | Status (answered / carried over) | Answer |
|---|---|---|
| Maximum note length? | answered | 500 characters |

## Out of scope
Attachments, mentions, notifications, persistence (the store is in memory).
