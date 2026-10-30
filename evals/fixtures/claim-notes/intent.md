---
change: claim-notes
status: accepted
author: Dana (claims ops)
origin: idea
ticket:
created: 2026-10-20
approved_by: Priya (PO)
---
# Intent: Adjusters can leave notes on a claim

## Problem
Adjusters keep their reasoning about a claim in spreadsheets and chat. When a claim changes hands, the next adjuster starts from zero and customers get asked the same questions twice.

## Proposed outcome
Each claim carries an ordered list of short notes (who wrote it, when, what), visible to anyone who reads the claim.

## Affected users and systems
Claims adjusters; the claims API (`src/claims`).

## Constraints
- Notes are append-only: nobody edits or deletes a note.
- No PII beyond what the claim already holds.

## How we know it worked
Adjusters add notes through the API and see them when they read the claim.

## Out of scope
Attachments, mentions, notifications.

## Open questions
- Maximum note length?
