---
name: sdlc-spec
description: Stage 2 (Design) of the AI-native loop. Takes an accepted intent.md and produces spec.md (requirements + design), applying the organization's policy skills and flagging the areas of concern. Use when an intent has been accepted, when asked to "generate the spec", or when running headless in CI after an intent is accepted.
argument-hint: "[changes/<slug> | slug]  (defaults to the current branch's change)"
---

# /sdlc-spec — requirements and design in one session

Goal: a spec engineering can plan against, with policies **applied while it is written** (not discovered in a review weeks later) and concerns flagged. The PO reviews it, does not write it.

Loop CLI: `sdlc` ({{sdlc_hint}}).

## 0. Prerequisites
1. Locate the change: `$ARGUMENTS`, or the current branch's (`change/<slug>` → `changes/*<slug>/`). If there is none, show `sdlc status` and ask which one.
2. `intent.md` must have `status: accepted`. If it is in `draft`, stop: "the intent has not been accepted by the PO yet". No exceptions: this is the Stage 1 gate.
3. If `spec.md` already exists, ask whether to iterate on the existing one or regenerate it.

## 1. Context
- Read the full `intent.md`, `CLAUDE.md` and the relevant architecture of the code (use the `researcher` subagent if the repo is large, so you don't fill up the context).
- Identify **which policy skills apply** (API security, brand, compliance, UX, data): the ones the project has available whose description matches the change. Load them and apply them.
- If there is a ticket and Jira, read the ticket's recent comments in case there is new context.

## 2. Write spec.md
From `changes/_templates/spec.md`. Rules:
- Numbered (R1, R2…) and **verifiable** requirements.
- The design references the existing code being reused; do not invent components that already exist.
- "Applied policies" table: which skill and how it was applied. Fill in `skills_applied` in the frontmatter.
- **Areas of concern**: everything an analyst would have escalated. Especially when two policies contradict each other or when the intent asks for something a policy does not allow. Do not resolve a policy conflict yourself: describe it and name the owner.
- Every open question from the intent: answered (with the answer) or explicitly carried over.
- `risk: high` if the design touches paths in `risk.high_risk_paths` of `.sdlc/config.json` or changes auth, sensitive data or public contracts.

## 3. Adversarial review
Before showing it, run the `spec-reviewer` subagent on intent.md + spec.md. Incorporate what it finds (or add it as a concern if it cannot be resolved).

## 4. Commit and Jira
- Commit: `spec(<slug>): <title>` (+ key). `status: draft`.
- Jira according to `tracker.mode`: `spec` transition (`sdlc tracker transition <KEY> spec`); comment with path + SHA; in `jira-sot` also a summary of the spec and the concerns as a comment. If it fails, say so and continue.

## 5. Gate: Product Owner (+ tech lead if `risk: high`)
Tell the PO what to review, in this order:
1. The **areas of concern** first: each one is resolved with its policy owner before engineering sees the spec.
2. Does the spec solve the intent's problem? Are the open questions answered or carried over?
Approval: `status: approved` + `approved_by`. If it is `risk: high`, a tech lead too.

## Headless mode (CI)
If you run with `claude -p` (no user): do not ask questions; write the spec, leave anything doubtful as a concern, commit and finish. The pipeline opens/updates the PR.

## Wrap-up
One line: spec written, number of open concerns, link to the PR/ticket, and **next step**: "When the PO approves it → `/sdlc-plan`".
