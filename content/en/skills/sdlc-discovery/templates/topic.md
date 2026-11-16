---
topic: <topic>
title: <Title>
created: <YYYY-MM-DD>
---
# <Title>

<!--
One topic per area the meetings keep coming back to (billing, onboarding, reports…). The file name is the topic: lowercase, digits and dashes.
`sdlc discovery validate` checks this file; `sdlc discovery status` reads it to write STATUS.md. Never delete a row: change its status.

Evidence, on every row: `<source> · [mm:ss ·] speaker: "quote"`. <source> is a label from ../_sources.md (`2026-03-02 Weekly review`)
or `seed`. Several pieces: separate them with <br>. A reimplemented feature adds `reason: why` as one more segment.

Closed lists (Spanish names are accepted too):
  Feature status   requested · in progress · done · reimplement · out of scope · dropped
                   done needs Repo `exists` or a confirmed ticket; reimplement needs `reason:` in the evidence
  Repo             missing · partial · exists · not verified   (what the code on the base branch has today)
  Ticket           KEY-12, #12 (confirmed) · ~KEY-12 (likely match, unconfirmed) · no ticket · not verified
  Blocked by       open questions of this topic (Q1) or another (billing#Q2); empty when nothing blocks it
  Action status    open · scheduled · verify · done · cancelled
  Owner / To       `Team: name` or `Client: name`
  Decision status  active · superseded by D3
  Question status  open · contradiction · answered · dropped   (Since: date of the first source that raised it)
  Risk status      active · mitigated · happened
-->

## Features
| ID | Feature | Status | Repo | Ticket | Blocked by | Evidence |
|---|---|---|---|---|---|---|

## Action items
| ID | Action | Owner | Status | Evidence |
|---|---|---|---|---|

## Decisions
| ID | Decision | Status | Evidence |
|---|---|---|---|

## Questions
| ID | Question | To | Status | Since | Answer | Evidence |
|---|---|---|---|---|---|---|

## Risks
| ID | Risk | Status | Evidence |
|---|---|---|---|

## Changes
<!-- Append only, one line per source that touched this topic: `- <source>: F2 added, Q1 answered (F3 unblocked)` -->
