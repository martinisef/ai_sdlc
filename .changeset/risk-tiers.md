---
'@morsadev/sdlc': minor
---

Risk tiers set by the change: `sdlc risk` and `sdlc ci risk` classify a change as low, medium or high from its diff (high-risk and always-human paths, weighted size, dependencies, deletions), the paths its spec and plan name, and the declared `risk:`. An optional second, agent classifier (`risk.agent_escalation`) can only raise the tier. New config: `risk.always_human_paths`, `risk.profile`, `risk.tiers`, `risk.trusted_authors`, `risk.size`, `risk.agent_escalation`.
