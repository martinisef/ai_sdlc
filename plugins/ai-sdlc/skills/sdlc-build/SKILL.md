---
name: sdlc-build
description: Stage 3 (Build) of the AI-native loop, second half. Implements a change against its approved plan.md with a feedback loop (build/test/lint until green), keeps plan.md in sync and verifies with the verifier subagent before considering it done. Use when there is an approved plan and you are asked to implement.
argument-hint: "[changes/<slug> | plan step number]"
---

# /sdlc-build — implement against the plan

Loop CLI: `sdlc` (if `sdlc` is not on the PATH: `node <this skill's base directory>/../../bin/sdlc.mjs`). Project commands: `.sdlc/config.json → commands` (build, test, lint, run).

## 0. Prerequisites
- `plan.md` of the active change with `status: approved`. If there is no approved plan: **do not implement**. Offer `/sdlc-plan`. (Exception: the user explicitly asks for a trivial change outside the loop; in that case say it will have no traceability.)
- Clean tree or understood changes.

## 1. Implement
Follow the plan's **work order**, step by step:
1. Implement the step.
2. Run the feedback loop: `commands.test` (and `build`/`lint` when applicable). Iterate until green **before** moving to the next step. If a test fails, fix the code, not the test.
3. Commit per step or per logical group: `feat(<slug>): <what>` (+ key if there is a ticket, so Jira links the commit).

The plugin's hooks will stop edits to protected paths, secrets and tests during a fix: if a hook blocks, **do not work around it**; read the message and follow the path it indicates.

## 2. Deviations
If the implementation departs from the plan (another file, another order, a new risk, a different verification): update `plan.md` → "Deviations during implementation" section **in the same commit** as the code. If the deviation changes the spec's scope, stop and ask: it may require going back to Stage 2.

## 3. Final verification
1. Run the full build, test and lint and save the output (it goes into the PR).
2. Launch the `verifier` subagent: it runs the app, tests the changed behavior and the neighboring flows, and compares against `plan.md`. It runs in a clean context, so its verdict is not biased by the assumptions that produced the code.
3. Optional: `simplifier` subagent on the diff if unnecessary complexity was left behind; run the tests again afterwards.
4. If it is UI: compare a screenshot against the spec's mock (with the available browser/screenshot tool), 2-3 rounds.

## Parallelism
If the plan marks independent steps that touch different files, suggest running them in parallel sessions: `claude --worktree <slug>-<step>`. Steps that share files go in a single session, in order.

## Wrap-up
Short summary: steps done, deviations recorded, test output, verifier verdict. **Next step**: "`/sdlc-ship` to open the PR".
