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

## Explainers
<!-- `sdlc explainers <paths>`: the module explainers this plan relies on, and the invariants it touches. -->
- `docs/explainers/<module>.md`: <invariant the change touches> (or: none)

## Risks
- <what can break and how it is mitigated>

## Verification
<!-- One line per requirement of spec.md: `sdlc trace` checks that every R is here, and the plan gate refuses a plan that drops one. Ranges work: `R3–R5`. -->
- R1: <test or check that proves it, with the exact command. E.g.: `tests/test_notes.py` covers the 4 states (`make test`)>
- Also: <checks not tied to one requirement: lint clean, screenshot matches the approved mock>

## Discarded alternatives
- <option> — <why not>

## Deviations during implementation
<!-- Filled in during /sdlc-build if the implementation departs from the plan, in the same commit. -->

## Verification findings
<!-- verifier, at the end of /sdlc-build. Same rules as the spec's Review findings, with IDs V1, V2…: /sdlc-ship does not open the PR while a Blocking one is open, and the accepted ones go to the PR's Risk section. -->
| ID | Severity | Finding | Status | Note |
|---|---|---|---|---|
