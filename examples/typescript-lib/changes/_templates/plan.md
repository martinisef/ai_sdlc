---
change: <slug>
status: draft            # draft → approved (engineer; tech lead if risk: high)
spec: ./spec.md
ticket:
risk: routine            # routine | high
approved_by:
---
# Plan: <title> (from spec.md <date>)

## Files that change
- `<path>` (new | modified): <what for>

## Work order
1. <small, verifiable step>
2.

## Risks
- <what can break and how it is mitigated>

## Verification
<Tests and checks that prove it works, with the exact command. E.g.: `make test` covers the 4 states; screenshot matches the approved mock.>

## Discarded alternatives
- <option> — <why not>

## Deviations during implementation
<!-- Filled in during /sdlc-build if the implementation departs from the plan, in the same commit. -->
