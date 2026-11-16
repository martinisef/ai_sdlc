---
'@morsadev/sdlc': minor
---

`sdlc trace <change>` checks that every requirement of spec.md (`R1`, `R2`…) has a line in the plan's Verification section, and that the plan names none the spec lacks. Approving a plan is refused while it reports an error. `/sdlc-plan` runs it before recording the plan, the `verifier` reports each requirement by ID, the plan template has one Verification line per requirement, and `sdlc ci gate-status` logs the coverage without blocking.
