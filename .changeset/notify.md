---
'@morsadev/sdlc': minor
---

Notifications: `sdlc notify <event>` posts `gate.pending`, `gate.decided`, `spec.ready`, `review.done` and `change.merged` to Slack or any webhook (Teams, Discord with `format: generic`), mentioning whoever has to act. `sdlc ci intent-to-spec`, `gate`, `gate-status`, `review` and `jira-merged` send them when `SDLC_NOTIFY_WEBHOOK` is set; new `notify` config (`webhook_env`, `format`, `events`, `people`). Fail-open.
