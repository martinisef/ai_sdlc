---
'@morsadev/sdlc': minor
---

New `/sdlc-explain <module>` skill: writes `docs/explainers/<module>.md` on demand with the module's architecture, invariants and risks, each with `file:line` evidence. `sdlc explainers [<path>…]` lists the explainers that cover some paths and marks the stale ones; `/sdlc-plan` cites them in a new **Explainers** section of `plan.md` and checks the plan against their invariants.
