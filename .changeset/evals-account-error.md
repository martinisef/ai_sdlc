---
'@morsadev/sdlc': patch
---

`sdlc ci evals` stops at the first case when the agent's provider refuses the account (quota exceeded, credit too low, invalid key) and says so, instead of running every case and reporting a 0% pass rate as if the agent had misbehaved. The report carries an `error`, the workflow summary explains it, and `sdlc ci scorecard` skips that report so the scorecard keeps the agent's last real result. Agent runs now capture stderr (still printed) to detect it, with keys masked.
