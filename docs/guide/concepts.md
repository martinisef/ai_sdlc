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

### Requirement traceability

The spec numbers its requirements (`- R1: …`) and the plan's **Verification** section says which test or check proves each one (`- R1: tests/test_notes.py`, `- R3–R5: …`). `sdlc trace <change>` checks both directions: every requirement has a line, and the plan names no requirement the spec lacks. Only the Verification section counts, so an `R2` mentioned in the steps does not cover it. Approving the plan (`sdlc approve`, `/approve plan` or the dashboard) is refused while `sdlc trace` reports an error. `/sdlc-plan` runs it before recording the plan, the `verifier` reports each requirement by ID, and `sdlc ci gate-status` logs the coverage without blocking, so plans approved before this check keep passing. A spec that numbers no requirements, or a change without a spec, only gets a warning.

## Stage by stage

| # | Command | Who | Human gate |
|---|---|---|---|
| 1 | `/sdlc-intent [PROJ-123]` | whoever has the idea (PM, support, dev) | PO accepts |
| 2 | `/sdlc-spec`, or automatic in CI once the intent is accepted | the agent; the PO reviews | PO resolves the *areas of concern* with each owner |
| 3 | `/sdlc-plan` | engineer + agent | engineer (tech lead if `risk: high`) |
| 4 | `/sdlc-build` | the agent implements; the engineer steers | none (tests green + `verifier`) |
| 4b | `/sdlc-fix` | for bugs: the failing test first, with the test-lock on | none |
| 4c | `sdlc quick "<what>"`, then `/sdlc-quick` | small, low-risk changes: no spec or plan | none; on every push the change must stay within `quick_lane` (10 code files, no high-risk paths) or be promoted with `sdlc promote` |
| 5 | `/sdlc-ship [--babysit]` | the agent opens the PR/MR and looks after it | code owner approves |
| 6 | `/sdlc-incident` | on-call + agent | on-call triages: fix now, schedule or dismiss |
| — | `/sdlc-status [--metrics]`, `sdlc next` | anyone | — |
| — | `/sdlc-explain <module>` | anyone, before changing code they do not know | — |

## Module explainers

A reviewer can only judge a diff if they know what the surrounding code promises. `/sdlc-explain src/billing` writes that down in `docs/explainers/src-billing.md`: what the module does, its architecture, the invariants the code relies on and the risks of changing it, each with `file:line` evidence and a note when no test guards an invariant. Explainers are written on demand, not on every change.

`/sdlc-plan` runs `sdlc explainers <paths that change>`, cites the explainers it finds in the plan's **Explainers** section and checks the plan against their invariants. An explainer is stale once the module gets commits after its `source_sha`; `sdlc explainers` marks it, and `/sdlc-explain <module> --refresh` updates it.

## Learnings

When you correct the agent during a stage in a way that should hold next time (call a stock item a SKU, run the migrations check before the tests), it asks once: "Keep that for next time?". On yes it runs `sdlc learn`, which adds one dated line under **Things Claude gets wrong** in `CLAUDE.md`, and in `AGENTS.md` when that adapter is on (outside the block `sdlc sync` regenerates), so every agent reads it from the next session on:

```markdown
## Things Claude gets wrong
- Call a stock item a SKU in every document, never a product (learned 2026-11-16, /sdlc-spec 2026-11-stock)
```

It does not ask about one-off fixes (a typo, a wrong name) and never asks in headless runs. Say "keep that" and it keeps it without asking. The same rule twice is kept once; a line that looks like a secret is refused. The line is committed with the change, so it goes through review like everything else. `sdlc learn list` shows them, and `sdlc doctor` warns past 30, the point where `CLAUDE.md` stops fitting on one page: merge the ones that say the same thing, or move them to **Conventions**.

## Closing the loop

An incident produces three things:

- a **new `intent.md`** with `origin: incident`;
- a **lesson** in `lessons/`;
- a **proposed eval** in `evals/`, so that the agent configuration learns from it.

[Control bands](../reference/bands.md) (`sdlc bands check`) start that path automatically when a metric leaves its band.

## Metrics

`sdlc metrics` (and the dashboard) compute leading indicators from git and the activity log:

- lead time from intent to spec and from spec to plan;
- spec rework after the plan;
- guardrail blocks per policy;
- gate decisions;
- human time per change: approvals, hours waiting for a person, review rounds and human comments (median and p95);
- the guardrails for spending less of it: revert rate and incidents per change ([details](../reference/telemetry.md#human-time-and-guardrails)).
