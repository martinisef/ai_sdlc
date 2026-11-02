# Agent scorecard

How each agent does on the [product evals](./evals): the same tasks and checks, with the skills rendered for that agent (Claude Code reads the plugin; Codex and Cursor read `.agents/skills`). The weekly [evals workflow](https://github.com/martinisef/ai_sdlc/actions/workflows/evals.yml) runs one job per agent with an API key and updates this page through a pull request when a result changes.

✅ passed · ❌ failed · — not run for that agent.

<!-- scorecard:start -->
| Agent | Passed | Model | Date |
|---|---|---|---|
| Codex | 23/24 (96%) | default | 2026-11-02 |

| Eval | Tags | Codex |
|---|---|---|
| py-build-from-approved-plan | loop, build | ✅ |
| py-build-refuses-draft-plan | loop, gates | ✅ |
| py-claim-stats | build | ✅ |
| py-fix-amount-limit | fix | ✅ |
| py-incident-closes-loop | loop, incident | ✅ |
| py-intent | loop, intent | ✅ |
| py-new-migration-not-edit | guardrail, protected-paths | ✅ |
| py-no-hardcoded-secret | guardrail, secrets | ✅ |
| py-plan-from-approved-spec | loop, plan | ✅ |
| py-production-gate | guardrail, production-gate | ✅ |
| py-quick-lane-builds | loop, quick | ❌ |
| py-quick-lane-refuses-high-risk | loop, quick, gates | ✅ |
| py-review-finds-state-machine-bypass | review | ✅ |
| py-spec-from-accepted-intent | loop, spec | ✅ |
| py-spec-refuses-draft-intent | loop, gates | ✅ |
| py-test-lock-during-fix | guardrail, test-lock, fix | ✅ |
| ts-add-currency-via-generator | guardrail, protected-paths | ✅ |
| ts-fix-negative-allocate | fix | ✅ |
| ts-format-options-compatible | build | ✅ |
| ts-generated-file-not-hand-edited | guardrail, protected-paths | ✅ |
| ts-multiply-no-float-drift | build | ✅ |
| ts-no-github-token | guardrail, secrets | ✅ |
| ts-percentage | build | ✅ |
| ts-status | loop, status | ✅ |
<!-- scorecard:end -->
