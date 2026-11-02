---
name: sdlc-quick
description: Quick lane of the AI-native loop. Implements a small, low-risk change (a copy fix, a field, a small endpoint tweak) without spec or plan, with tests, inside the project's quick_lane limits. Use when the person asks for a small change and says quick, or there is an active change with lane quick. Refuses and promotes the change to the full loop when it touches high-risk paths or grows beyond the limits.
argument-hint: "[what to change | changes/<slug>]"
---

# /sdlc-quick — small change, still traced

The quick lane skips spec and plan, not the discipline: there is still a change folder, a branch, tests and a PR. The limits are checked on every push, so a quick change that grows is stopped.

Loop CLI: `sdlc` (if `sdlc` is not on the PATH: `node <this skill's base directory>/../../bin/sdlc.mjs`). Commands: `.sdlc/config.json → commands`. Limits: `quick_lane` (`max_files`, default 10 code files; `forbid_paths`) plus `risk.high_risk_paths`.

## 0. Is it really quick?
Before touching code, decide from the request and a quick read of the code:
- Which files will change? If any is under `risk.high_risk_paths` or `quick_lane.forbid_paths` (auth, payments, data stores, migrations, infra): **it is not quick**.
- More code files than `quick_lane.max_files`, a new dependency, a schema or contract change, or a product decision someone has to take: **it is not quick**.

If it is not quick: do not implement. Run `sdlc promote` (if a quick change exists) and say why in one sentence; the next step is `/sdlc-intent` and the PO's acceptance. If there is no change yet, propose `sdlc new <slug>` instead.

## 1. Start
- With an active change whose `intent.md` has `lane: quick`: work on it.
- Otherwise: `sdlc quick "<what to change>"` creates `changes/<date>-<slug>/intent.md` (lane quick) on branch `change/<slug>`.

## 2. Implement
1. Write or update the test that covers the change first when behavior changes; a pure copy or config tweak needs no new test.
2. Implement the smallest change that does it.
3. Run `commands.test` and `commands.lint` until green. If a test fails, fix the code, not the test.
4. `sdlc quick --check`: if it says to promote, stop and promote (section 0).
5. Commit: `feat(<slug>): <what>` or `fix(<slug>): <what>` (+ ticket key if any).

Hooks still apply: protected paths, secrets, the production gate. If a hook blocks, do not work around it.

## 3. Close
Summarize what changed and the test output, then **next step**: "`/sdlc-ship` to open the PR". The review checks the quick lane limits again.
