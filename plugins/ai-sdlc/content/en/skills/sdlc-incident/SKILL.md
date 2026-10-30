---
name: sdlc-incident
description: Stage 6 (Maintain) of the AI-native loop. Diagnoses an incident, alert or broken band in read-only mode, and closes the loop by writing it up as a new intent.md (origin incident), a lesson in lessons/ and an eval proposal; if the fix is small and contained, it hands off to /sdlc-fix. Use on an alert, an incident, a test that started failing in CI, or an urgent request from a channel.
argument-hint: "[description | PROJ-123 | broken metric]"
---

# /sdlc-incident — the loop closes

Deterministic detection, diagnosis with Claude, action only through gated paths. People triage and review; they don't have to kick off the work.

Loop CLI: `sdlc` ({{sdlc_hint}}).

## 1. Diagnosis (read-only)
- **Do not edit code or run actions with side effects** in this phase. Read logs, the diff of the last deploy, CI history, `lessons/` (similar incidents), and metrics with the available tools or MCP.
- Compare the error signature against recent changes (`git log` for the period, merged PRs).
- Result: probable cause with **evidence** and confidence level.

## 2. Immediate action (only with human authorization)
- If there is a pre-approved runbook (rollback, quarantine of a flaky test) and the impact justifies it: **propose it and wait for an explicit "yes"** before running it. The plugin's production gate blocks deploys without authorization.
- Afterwards, verify that the metric is back within its band.

## 3. Close the loop
Choose the path based on the size of the fix:
- **Small and contained** (one clear cause, few files, testable): offer to continue with `/sdlc-fix`.
- **Larger or involving product decisions**: write `changes/<YYYY-MM>-<slug>/intent.md` from the template with `origin: incident`: the anomaly and its evidence, proposed outcome, affected systems, open questions. Branch `change/<slug>`, commit. It enters the loop like any other intent.

In both cases:
1. `lessons/<YYYY-MM-DD>-<slug>.md` in the format of `lessons/README.md`.
2. Eval proposal in `evals/<slug>.json` (prompt + checks) so this class of incident does not go unnoticed again.
3. Jira: create a ticket of type `tracker.incident_issue_type` linked to the intent and the lesson (`sdlc tracker create --type <type> ...`). If it fails, warn and continue.

## 4. Triage
Make it clear that the on-call or service owner decides: **fix now / schedule / dismiss**. Dismissals are used to tune the bands (`ops/bands.yaml`).

## Headless mode (invoked by the band detector)
No user: only steps 1 and 3 (diagnosis + intent + lesson + eval proposal), never actions from step 2. Finish with a 3-line summary for the channel or the PR.
