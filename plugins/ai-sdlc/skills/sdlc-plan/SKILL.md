---
name: sdlc-plan
description: Stage 3 (Build) of the AI-native loop, first half. Builds the implementation plan in plan mode from an approved spec.md, interrogates it and records it as an approved plan.md. Use when a spec has been approved, when asked to "plan" a change, or before implementing anything non-trivial.
argument-hint: "[changes/<slug> | slug]"
---

# /sdlc-plan — nothing gets implemented without an accepted plan

Goal: review the design **before** generating code, while changing course is still just editing a document. The approved plan is what the PR review will compare the diff against.

Loop CLI: `sdlc` (if `sdlc` is not on the PATH: `node <this skill's base directory>/../../bin/sdlc.mjs`).

## 0. Prerequisites
1. Active change (branch `change/<slug>`) or `$ARGUMENTS`.
2. `spec.md` with `status: approved`. If it does not exist: for small changes without a spec (bugfix, scoped refactor) you can plan from an accepted `intent.md`; say so explicitly. If the spec is in draft, stop (only `status` counts, not `approved_by`).
3. **Read-only until the plan is accepted.** Use the agent's planning mode if it has one; if it is not on, ask once before continuing:
   - Claude Code: plan mode (Shift+Tab until "plan mode", or start with `claude --permission-mode plan`).
   - Cursor: Plan mode (switch to it yourself if you can).
   - Codex: a read-only sandbox (`codex --sandbox read-only`).
   If none is available (e.g. headless), work read-only until step 4. Either way, the `plan-first` guardrail refuses edits to code on the change branch until the plan is approved; only files under `changes/<slug>/`, docs and agent configuration can change.

## 1. Build the plan
Read intent.md, spec.md, CLAUDE.md and the relevant code. The plan must name:
- **Files that change** (new and modified) and what for.
- **Work order** in small, verifiable steps. Mark which steps are independent (candidates for parallel sessions in worktrees).
- **Risks** and how they are mitigated.
- **Verification**: one line per requirement of spec.md (`- R1: <test or check>`, ranges like `R3–R5` work), with commands from `.sdlc/config.json → commands`, plus the checks not tied to one requirement. Before presenting the plan, check it against the spec's requirements; once plan.md exists, `sdlc trace <slug>` verifies it: every `✗` is a requirement the plan does not prove yet.
- **Discarded alternatives** and why.

Explainers: once you know which files change, run `sdlc explainers <those paths>`. Read every explainer it lists before designing, cite them in the plan (**Explainers** section) and check the plan against their invariants: an invariant the change touches is a risk, and one with no test needs a test in the plan. If one is stale, say so and suggest `/sdlc-explain <module> --refresh`. If a module the plan changes heavily has none and nobody on the team knows it well, suggest `/sdlc-explain <module>` before accepting the plan.

## 2. Interrogate it
Before presenting it, answer for yourself and show:
- What can this change break? Which is the riskiest step?
- What other options did you discard?
- Does it touch `protected_paths` or `risk.high_risk_paths`? If it touches protected ones, the plan must say who does that part (the hooks will block the edit).
Invite the engineer to correct it. Iterate until **someone who never saw this conversation could implement the change with only the plan**.

## 3. Acceptance (gate)
The engineer accepts the plan (in Claude Code and Cursor, when leaving plan mode). If `risk: high`, a tech lead or architect is also needed: leave it in `status: draft` and request that approval.

With `risk.profile: graded`, the tier decides how many people (`sdlc risk <slug>`; the paths the plan names count): low needs nobody (`sdlc approve <slug> plan --auto` once plan.md is written in draft), medium needs the engineer, high needs the engineer and one more person (leave `status: draft` with `approved_by: <engineer>` and ask for the second `sdlc approve`).

## 4. Record plan.md
Once the plan is accepted (out of plan mode), write `changes/<slug>/plan.md` from the template with the accepted plan, `status: approved`, `approved_by: <engineer>`, `risk`. Run `sdlc trace <slug>`: if it reports a requirement the plan does not cover, the plan is not the one to record. Add how it is verified and confirm it with the engineer, or set `status: draft` and say why. Commit: `plan(<slug>): <title>` (+ key).
Tracker: `plan` transition + comment with path and SHA (`jira-sot`: also a summary). If it fails, say so and continue.

## Keep what you learned
If the person corrected what you did or assumed in this stage in a way that would hold next time (a term, a convention, a check to run, something to never do), ask once per correction, in their words: "You asked me to <…>. Keep that for next time?". On yes: `sdlc learn "<the rule, one imperative line>" --stage plan --change <slug>`. Do not ask about one-off fixes (a typo, a wrong name, one value), and never in headless runs. If they ask outright to keep something ("next time, use the shared fixtures"), run it without asking and say in one line where it went. Commit `CLAUDE.md` (and `AGENTS.md`) with the change.

## Wrap-up
One line with the next step: "`/sdlc-build` to implement against the plan" (or, if there are independent steps, suggest `claude --worktree <name>` per step).
