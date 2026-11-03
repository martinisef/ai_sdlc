---
'@morsadev/sdlc': minor
---

`sdlc metrics` and the dashboard measure human time per change: approvals given by people, hours waiting for a person, review rounds and human comments (median and p95). Next to them are the guardrails: the revert rate on the default branch and incidents per change. `sdlc metrics --prs` caches rounds and comments from the forge, `--since 30d` sets the window, and `--value <name>` prints one number for a control band. A band tier with `raise_risk: { tier, hours }` is a circuit breaker: it raises the minimum risk tier for a while (`refs/sdlc/risk-floor`, read by `sdlc ci risk` and the gates) and announces it with the new `risk.raised` notification.
