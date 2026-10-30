---
name: sdlc-status
description: Shows which stage of the AI-native loop each change (changes/*) is at, the state of its PR/MR and its Jira ticket, flags inconsistencies and suggests the next command. With --metrics it computes the playbook indicators from git. Use when asked "where are we", "what's next", the state of the changes, or loop metrics.
argument-hint: "[--metrics]"
---

# /sdlc-status — where each change is

Loop CLI: `sdlc` (if `sdlc` is not on the PATH: `node <this skill's base directory>/../../bin/sdlc.mjs`).

## Status
1. `sdlc status --json` → one object per change: `change`, `stage`, `ticket`, `statuses` (intent/spec/plan), `active`, `next`.
2. For the active change (and for the others if there are few, ≤ 5): `sdlc vcs pr-current` from its branch or by searching by branch, to find out whether there is a PR and its state.
3. If `tracker.provider = jira` and the change has a ticket: ticket status (Atlassian MCP or `sdlc tracker get <KEY>`).
4. Show a table:

| Change | Stage | Ticket (status) | PR | Next step |
|---|---|---|---|---|

Mark the active one with ▶.

## Inconsistencies to flag
- Ticket *Done* but PR open or unmerged, or PR merged with the ticket not closed.
- Ticket still in *To Do* with spec or plan already approved (a transition failed).
- `plan.md` approved but the branch has had no code commits for a long time (stalled change).
- Intent in draft for more than 2 weeks (ask the PO for a decision).
- `.sdlc/fix-lock` present with no fix in progress.
Do not fix anything automatically: list them and offer to fix them.

## --metrics
`sdlc status --metrics` and present the playbook's leading indicators:
- Time intent → spec (Stage 2: should drop from weeks to hours).
- Time spec → plan.
- Spec rework after the plan (commits to spec.md after the first plan.md: Stage 2 lagging).
If there are PRs, add time to first review and whether they merged on the first pass. Make clear that these are approximate metrics taken from git.
