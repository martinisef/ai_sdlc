# Review instructions

## Passes
Run three passes and tag each finding with its pass:
- **Bugs**: logic errors, broken edge cases, subtle regressions.
- **Security**: injection, authentication/authorization gaps, PII in logs or errors, secrets.
- **Compliance**: the change complies with `changes/<slug>/spec.md` and `plan.md` (files, order, verification) and with the design principles in CLAUDE.md. If the diff departs from the plan and `plan.md` does not record the deviation, that is a finding.

## What Important means here
Reserve **Important** for findings that break behavior, leak data or violate a policy.
Style and naming are **Nit**.
- Important here: any loss or creation of a minor unit (rounding, `allocate`), mixing currencies without an error, `number` arithmetic on amounts, breaking a public export without a plan note.

## Loop rules
- In fix PRs: the test that reproduces the bug is not modified after its commit. If it changed, that is Important.
- Changes to paths in `risk.high_risk_paths` (.sdlc/config.json): flag that they require tech lead approval.
- If the change leaves `CLAUDE.md` out of date, say so.

## Cap the nits
Report at most five nits per review; summarize the rest as a count.

## Do not report
- `src/gen/**` (generated).
- Type checking (CI runs `tsc --noEmit`).
- Whatever CI already checks (formatting, lint).
