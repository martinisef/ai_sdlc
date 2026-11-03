# Review instructions

## Passes
`sdlc ci review` runs one finder per pass and a verifier that votes on each finding. Tag each finding with its pass:
- **Bugs**: logic errors, broken edge cases, subtle regressions.
- **Security**: injection, authentication/authorization gaps, PII in logs or errors, secrets.
- **Compliance**: the change complies with `changes/<slug>/spec.md` and `plan.md` (files, order, verification) and with the design principles in CLAUDE.md. If the diff departs from the plan and `plan.md` does not record the deviation, that is a finding.

Depth follows the risk tier (`sdlc risk`): **Quick** at low (one finder for every pass), **Standard** at medium (one finder per pass), **Deep** at high (also **Tests** and **Regressions** in code outside the diff, and three verifier votes).

## Severity
Every finding has one, a `file:line` and the evidence that proves it:
- **Important**: breaks behavior, leaks data or violates a policy. Fix it before merging.
- **Nit**: minor and worth fixing, never blocking. Style and naming are Nit.
- **Pre-existing**: a real problem in code this PR did not change. Listed so it is not lost, not to block this PR.

Also give each finding a **bug class** (off-by-one, missing authorization check, unhandled error…): it says what to look for elsewhere and feeds the reviewer's evals.

## What Important means here
<!-- /sdlc-setup fills in the project-specific criteria -->

## Convergence
- At most three rounds per PR (`ci.review.max_rounds`). After that, the reviewer only checks whether the open findings were fixed; a person reviews the rest.
- From the second round on, review only the commits since the last round.
- Never report a finding again, even reworded. A finding that is still there stays open; it is not a new one.
- The verifier drops what the code does not support and anything that is only style.

## Loop rules
- In fix PRs: the test that reproduces the bug is not modified after its commit. If it changed, that is Important.
- Changes to paths in `risk.high_risk_paths` (.sdlc/config.json): flag that they require tech lead approval.
- If the change leaves `CLAUDE.md` out of date, say so.

## Cap the nits
Report at most five nits per review; summarize the rest as a count.

## Do not report
<!-- /sdlc-setup fills in: generated code, vendored code, whatever CI already checks (lint, formatting) -->
- Whatever CI already checks (formatting, lint).
