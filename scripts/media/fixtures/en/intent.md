---
change: mark-done
status: draft            # draft → accepted (Product Owner) | rejected
author: Ana Dev
origin: idea             # idea | ticket | incident | review
ticket:
created: 2026-11-03
approved_by:
---
# Intent: Mark a to-do as done

## Problem
Once a to-do is added it stays on the list forever. People cannot tell what is left to do.

## Proposed outcome
`todo done <id>` marks a to-do as done; `todo list` shows done ones with a tick.

## Affected users and systems
Everyone who uses the CLI. The `todos.json` file gains a `done` field.

## Constraints
Old `todos.json` files, without `done`, must keep working.

## How we know it worked
Marking a to-do as done and listing shows `[x]` next to it.

## Out of scope
Deleting to-dos. Undoing "done".

## Open questions
- None.
