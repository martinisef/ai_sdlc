---
name: sdlc-plan
description: Stage 3 (Build) of the AI-native loop, first half. Builds the implementation plan in plan mode from an approved spec.md, interrogates it and records it as an approved plan.md. Use when a spec has been approved, when asked to "plan" a change, or before implementing anything non-trivial.
argument-hint: "[changes/<slug> | slug]"
---

# /sdlc-plan — nothing gets implemented without an accepted plan

Goal: review the design **before** generating code, while changing course is still just editing a document. The approved plan is what the PR review will compare the diff against.

Loop CLI: `sdlc` (if it is not on the PATH: `.sdlc/bin/sdlc`).

## 0. Prerequisites
1. Active change (branch `change/<slug>`) or `$ARGUMENTS`.
2. `spec.md` with `status: approved`. If it does not exist: for small changes without a spec (bugfix, scoped refactor) you can plan from an accepted `intent.md`; say so explicitly. If the spec is in draft, stop.
3. **Plan mode**: if the session is not in plan mode, ask the user to enable it (Shift+Tab until "plan mode") before continuing. In plan mode Claude can read the repo but cannot change anything until the plan is accepted. If that is not possible (e.g. headless), work read-only until step 4.

## 1. Build the plan
Read intent.md, spec.md, CLAUDE.md and the relevant code. The plan must name:
- **Files that change** (new and modified) and what for.
- **Work order** in small, verifiable steps. Mark which steps are independent (candidates for parallel sessions in worktrees).
- **Risks** and how they are mitigated.
- **Verification**: the tests and checks that prove it works, with commands from `.sdlc/config.json → commands`.
- **Discarded alternatives** and why.

## 2. Interrogate it
Before presenting it, answer for yourself and show:
- What can this change break? Which is the riskiest step?
- What other options did you discard?
- Does it touch `protected_paths` or `risk.high_risk_paths`? If it touches protected ones, the plan must say who does that part (the hooks will block the edit).
Invite the engineer to correct it. Iterate until **someone who never saw this conversation could implement the change with only the plan**.

## 3. Acceptance (gate)
The engineer accepts the plan (when exiting plan mode). If `risk: high`, a tech lead or architect is also needed: leave it in `status: draft` and request that approval.

## 4. Record plan.md
Once out of plan mode, write `changes/<slug>/plan.md` from the template with the accepted plan, `status: approved`, `approved_by: <engineer>`, `risk`. Commit: `plan(<slug>): <title>` (+ key).
Jira: `plan` transition + comment with path and SHA (`jira-sot`: also a summary). If it fails, say so and continue.

## Wrap-up
One line with the next step: "`/sdlc-build` to implement against the plan" (or, if there are independent steps, suggest `claude --worktree <name>` per step).
