---
'@morsadev/sdlc': minor
---

Quick lane for small, low-risk changes: `sdlc quick "<what>"` creates an intent with `lane: quick` (stage `quick-ready`, no spec or plan) and the new `/sdlc-quick` skill implements it with tests. The pre-push hook enforces `quick_lane` limits (default 10 code files, nothing under `risk.high_risk_paths` or `quick_lane.forbid_paths`); `sdlc quick --check` reports them and `sdlc promote` moves the change to the full loop.
