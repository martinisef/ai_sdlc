---
'@morsadev/sdlc': minor
---

Review findings with stable IDs (experimental). `spec-reviewer` writes a **Review findings** table to spec.md (`S1`, `S2`…) and the `verifier` a **Verification findings** table to plan.md (`V1`…). A re-review keeps the IDs and marks what was resolved. Approving a spec with an open Blocking finding is refused; approving with Important or Minor ones open marks them accepted and adds an `Accepted-risk:` trailer to the gate commit. `/sdlc-ship` does not open the PR with an open Blocking finding and lists the accepted ones under Risk. New `sdlc findings <change> [--json]`, and the dashboard shows the open and accepted findings of a change.
