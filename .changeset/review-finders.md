---
'@morsadev/sdlc': minor
---

`sdlc ci review` now runs one finder per pass in parallel and a verifier that votes on each finding, dropping what the code does not support and anything that is only style. Findings carry a severity (Important, Nit, Pre-existing), `file:line`, evidence and a bug class; they are posted as inline comments, with a sticky summary that starts with the counts. Depth follows the risk tier (low Quick, medium Standard, high Deep with three votes; `ci.review.depth` overrides it). Re-reviews look only at the commits since the last round, never repeat a finding, notice fixes and stop at `ci.review.max_rounds` (3). The `REVIEW.md` scaffold describes the new severities and convergence rules.
