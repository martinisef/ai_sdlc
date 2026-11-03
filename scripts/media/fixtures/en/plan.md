---
change: mark-done
status: draft            # draft → approved (engineer; tech lead if risk: high)
spec: ./spec.md
ticket:
risk: routine
approved_by:
---
# Plan: Mark a to-do as done (from spec.md 2026-11-03)

## Files that change
- `src/todos.js` (modified): `done()` and the box in `format()`.
- `src/cli.js` (modified): the `done <id>` command.
- `test/todos.test.js` (modified): tests for R1 to R4.

## Work order
1. Tests for R1 to R4 (they fail).
2. `done()` and `format()` until they pass.
3. The `done` command in the CLI.

## Explainers
- none

## Risks
- Old files without `done`: R4 has its own test.

## Verification
`npm test` covers R1 to R4; `npm run lint`.

## Discarded alternatives
- A separate `done.json` file — two files to keep in step.

## Deviations during implementation
