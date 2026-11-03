---
change: mark-done
status: draft            # draft → approved (Product Owner, with concerns resolved)
intent: ./intent.md
ticket:
skills_applied: []
risk: routine
approved_by:
---
# Spec: Mark a to-do as done

## Summary
A new `done <id>` command sets `done: true` on a to-do. `list` prints `[x]` for done to-dos and `[ ]` for the rest.

## Requirements
- R1: `done(todos, id)` returns the list with that to-do marked `done: true`.
- R2: `done` with an id that does not exist throws "no to-do with id <id>".
- R3: `format` prints `1. [x] buy milk` for a done to-do and `2. [ ] call mum` otherwise.
- R4: a to-do without a `done` field (old files) counts as not done.

## Non-functional requirements
No new dependencies.

## Design
`src/todos.js` gains `done()`; `format()` adds the box. `src/cli.js` gains the `done` command.

## Applied policies
| Policy (skill) | How it was applied |
|---|---|
| none | — |

## Areas of concern
| # | Concern | Policy / reason | Owner | Resolution |
|---|---|---|---|---|
| C1 | Old `todos.json` files | compatibility | Ana Dev | R4: missing `done` means not done |

## Open questions from the intent
| Question | Status (answered / carried over) | Answer |
|---|---|---|

## Out of scope
Deleting and undoing.
