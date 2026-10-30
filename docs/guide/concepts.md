# The loop

## One change = one folder = one branch = one PR

```
changes/2026-10-claim-notes/      branch: change/claim-notes
  intent.md   spec.md   plan.md
```

`sdlc new <slug>` (or `/sdlc-intent`) creates the folder and the branch. Each stage ends by **committing its artifact**, and the next stage reads it. That way the decision history lives in git next to the code.

## Artifacts and statuses

Every artifact has YAML front-matter. Its `status` drives the loop:

| Artifact | Statuses | Written by | Gate |
|---|---|---|---|
| `intent.md` | `draft` → `accepted` \| `rejected` | whoever has the idea, with `/sdlc-intent` | Product Owner |
| `spec.md` | `draft` → `approved` \| `rejected` | the agent (`/sdlc-spec`, or CI when an intent is accepted) | PO, plus policy owners for each *area of concern* |
| `plan.md` | `draft` → `approved` \| `rejected` | engineer + agent, with `/sdlc-plan` | engineer; tech lead when `risk: high` |

`sdlc status` derives the **stage** of each change from those statuses and from git:

`no-intent` → `intent-draft` → `intent-accepted` → `spec-draft` → `spec-approved` → `plan-draft` → `plan-approved` → `building` (code commits on the branch) → `merged`. A `rejected` artifact anywhere puts the change in `rejected`.

`spec.md` carries `risk: routine | high`. A change is high-risk when it touches `risk.high_risk_paths`. The plan of a high-risk change also needs a `tech-lead`.

## Gates

A gate decision is a **commit**: `sdlc approve <change> <artifact> [-m comment]` or `sdlc reject …`, or the buttons in the dashboard. The commit sets `status`, `approved_by` and `approved_at`, and ends with a line like `Gate: spec approved by Ana Dev <ana@example.com>`. If the change's branch is not checked out, the decision is committed on that branch without touching your working tree.

Who may approve is set by `gates` (role names per artifact) and `roles` (role → emails or git names) in `.sdlc/config.json`:

- **Agents and bots never approve.** Identities that look like one (`claude`, `anthropic`, `cursor`, `codex`, `copilot`, `[bot]`, `noreply@github`) are refused.
- **The author of a spec or plan cannot approve it.** Another person must.
- **A role with no members** lets any person approve, so the team is not locked out while roles are being set up.

## Stage by stage

| # | Command | Who | Human gate |
|---|---|---|---|
| 1 | `/sdlc-intent [PROJ-123]` | whoever has the idea (PM, support, dev) | PO accepts |
| 2 | `/sdlc-spec`, or automatic in CI once the intent is accepted | the agent; the PO reviews | PO resolves the *areas of concern* with each owner |
| 3 | `/sdlc-plan` | engineer + agent | engineer (tech lead if `risk: high`) |
| 4 | `/sdlc-build` | the agent implements; the engineer steers | none (tests green + `verifier`) |
| 4b | `/sdlc-fix` | for bugs: the failing test first, with the test-lock on | none |
| 5 | `/sdlc-ship [--babysit]` | the agent opens the PR/MR and looks after it | code owner approves |
| 6 | `/sdlc-incident` | on-call + agent | on-call triages: fix now, schedule or dismiss |
| — | `/sdlc-status [--metrics]` | anyone | — |

## Closing the loop

An incident produces three things:

- a **new `intent.md`** with `origin: incident`;
- a **lesson** in `lessons/`;
- a **proposed eval** in `evals/`, so that the agent configuration learns from it.

[Control bands](../reference/bands) (`sdlc bands check`) start that path automatically when a metric leaves its band.

## Metrics

`sdlc metrics` (and the dashboard) compute leading indicators from git and the activity log:

- lead time from intent to spec and from spec to plan;
- spec rework after the plan;
- guardrail blocks per policy;
- gate decisions.
