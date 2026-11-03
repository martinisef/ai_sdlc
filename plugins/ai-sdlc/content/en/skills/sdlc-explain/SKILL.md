---
name: sdlc-explain
description: Writes or refreshes the explainer of one module in docs/explainers/ — what it does, its architecture, the invariants the code relies on and the risks of changing it, each with file:line evidence. Does not touch code. /sdlc-plan cites the explainers of the modules a plan touches. Use when someone asks how a module works, before planning a change in code nobody on the team knows well, or when `sdlc explainers` reports one as stale.
argument-hint: "<module path> [--refresh]"
---

# /sdlc-explain — what you need to know before changing a module

Goal: a reviewer can only judge a diff if they know what the code around it promises. The explainer writes that down once, on demand, so plans and reviews can lean on it instead of rediscovering it.

Loop CLI: `sdlc` ({{sdlc_hint}}).

## 0. Scope
1. `$ARGUMENTS`: a directory or file (`src/billing`). If missing, ask which one; offer the top-level code directories.
2. Target file: `docs/explainers/<path with / replaced by ->.md` (`src/billing` → `docs/explainers/src-billing.md`).
3. If it already exists, `sdlc explainers <module>`: if it is not stale and there is no `--refresh`, say it is current and stop. Otherwise update it, keeping what still holds.
4. Read-only for code: this skill writes only the explainer.

## 1. Read
- `git ls-files <module>`: entry points and public surface (exports, routes, commands, events).
- The tests: what they assert is the behavior someone already promised.
- The callers: imports of the module from outside it. That is who breaks when it changes.
- Configuration and environment it reads; data it owns (tables, files, queues).
- `lessons/`, `changes/*/spec.md` and `git log --format='%h %s' -30 -- <module>` that mention it: past incidents, reverts, decisions.
- `.sdlc/config.json → risk.high_risk_paths`, `protected_paths` and CODEOWNERS for the module.

## 2. Write
```markdown
---
module: <module path>
source_sha: <git log -1 --format=%h -- <module>>
updated: <YYYY-MM-DD>
---
# <module>: <what it is, one line>

## What it does
<two or three sentences; who uses it>

## Architecture
<main pieces and how data flows between them; a mermaid diagram if it helps>

## Invariants
- <a rule the code relies on> — `file:line`; guarded by `<test>` (or: no test)

## Risks
- <what breaks easily, why, and how it showed up before (lesson, revert, incident)>

## Changing it
- <where to start, which tests to run (`.sdlc/config.json → commands`), who owns it>

## Open questions
- <what the code does not answer>
```
Rules:
- Every invariant and every risk carries `file:line` evidence. If you cannot point at the code, it goes under Open questions.
- "No test" next to an invariant is a finding: say it.
- Describe what the code does today, not what it should do. Do not propose changes here.
- At most about 150 lines. Link to code instead of copying it.

## 3. Commit
It is documentation the person asked for, so it does not need an intent. Commit only the explainer: `docs(explain): <module>`.

## Wrap-up
The path, the number of invariants without a test, and one line: "`/sdlc-plan` will cite it when a plan touches <module>."
