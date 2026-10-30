---
name: sdlc-fix
description: Stage 4 (Test) of the AI-native loop for bugs. Reproduces the bug as a failing test, commits it, turns on the test-lock and only then fixes the code without being able to touch the test. Use when a bug needs fixing, a test is red in production or an incident has a scoped fix.
argument-hint: "[bug description | PROJ-123 | changes/<slug>]"
---

# /sdlc-fix — the failing test comes first

A test that existed before the fix, and that the agent could not rewrite, is the proof that the bug is gone.

Loop CLI: `sdlc` (if it is not on the PATH: `.sdlc/bin/sdlc`). Commands: `.sdlc/config.json → commands`.

## 0. Change context
- If the bug is part of an in-progress change, work on its branch.
- If it is a new bug: create a lightweight change. Branch `change/<slug>` (or `change/<KEY>-<slug>` with a ticket), folder `changes/<...>/` with a short `intent.md` (`origin: ticket|incident`) and a brief `plan.md` (files, verification = the test you are going to write). For small bugs it is enough for the engineer to accept the plan in the session; no spec needed.
- With a ticket and Jira: read it (MCP or `sdlc tracker get <KEY>`).

## 1. Reproduce
1. Write a test that reproduces the bug in the project's test location (`test_globs`).
2. Run it and **confirm it fails for the expected reason** (not because of a broken import or a bad setup). Show the output.
3. Commit the test alone: `test(<slug>): reproduce <bug>`.

## 2. Turn on the test-lock
`sdlc lock on`. From here on the `test-lock` hook blocks any edit to test files.

## 3. Fix
- Change the code until the test passes, without editing any test.
- Run the full suite: the fix must not break anything else.
- If you become convinced the test is written wrong, **do not change it yourself**: explain it to the engineer; they decide whether to release the lock.

## 4. Close
1. With everything green, `sdlc lock off`.
2. Commit the fix: `fix(<slug>): <what>` (+ key).
3. If the bug came from an incident, propose adding an eval in `evals/` with this case (see `/sdlc-incident`).
4. **Next step**: "`/sdlc-ship` to open the PR". The review will verify that the test did not change after its commit.
