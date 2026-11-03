---
'@morsadev/sdlc': minor
---

Human approvals scaled by risk (`risk.profile: graded`): low 0, medium 1, high 2, also for the spec and plan gates. The intent always needs a person. `sdlc approve --auto` records the approval when the tier needs nobody; a gate approved at a lower tier opens again when the change grows. `sdlc ci gate-status` counts the PR's reviews against the tier of its diff, pinned to the commit they were given on (untrusted commits invalidate them), and counts the person directing the agent as one reviewer. Only `risk.trusted_authors` get the lighter paths; an agent's approval never counts.
