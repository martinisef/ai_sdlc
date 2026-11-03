# Risk tiers

A docs fix and a change to the auth middleware carry different risk, so they should get different review. Each change has a **risk tier** (`low`, `medium` or `high`), set by the change itself and not by its author. `sdlc risk` shows it locally; `sdlc ci risk` keeps it in a sticky PR comment.

## How the tier is set

The tier is the highest of these signals. None of them can lower it.

1. **The diff against the base branch.** A deterministic classifier looks at:
   - paths under `risk.high_risk_paths` (high);
   - paths under `risk.always_human_paths` (at least medium). By default these are CI workflows, `.sdlc/**` and `REVIEW.md`: a change that edits the checks is never low risk;
   - dependency manifests and lockfiles, `protected_paths`, `append_only_paths`, and deleted code files (medium);
   - size, in weighted lines of code: modified and deleted lines count fully, lines in new files count half, and docs and `test_globs` do not count. More than `risk.size.low_max_lines` (50) is medium; `risk.size.high_min_lines` (800) or more is high.
2. **The paths the spec and plan name.** Before any code exists, the backticked paths in `spec.md` and `plan.md` (`src/auth/session.ts`, `infra/`) go through the same classifier, so the planned blast radius counts too.
3. **The declared `risk:`** in the spec or plan frontmatter.
4. **A second classifier** (optional, `risk.agent_escalation: true`). A read-only agent run reads the diff, spec and plan, and answers one question: does this change need another person even though its tier says it doesn't? It escalates for auth, money, irreversible migrations, public contracts, concurrency, security boundaries, CI and release workflows, and patterns others will copy.

```console
$ sdlc risk
changes/2026-11-session-timeout: high risk (4 files against main, 38 weighted lines of code)
  high   src/auth/session.ts is a high-risk path (src/auth/**)
```

## Approvals per tier

With `risk.profile: graded`, how many people must approve scales with the tier. The defaults (override them in `risk.tiers`):

| Tier | Human approvals | Examples |
|---|---|---|
| low | none once the automated checks are green | docs, copy, small additive changes |
| medium | one person | ordinary product changes, dependencies, CI files |
| high | two people | `risk.high_risk_paths`, large changes, anything the second classifier escalates |

The rules that keep this safe:

- **The intent always needs a person.** Deciding whether to build something is not delegated, whatever the tier.
- **Spec and plan follow the tier.** At low risk, `sdlc approve <change> spec --auto` records the approval as `sdlc (risk low)` (the skills run it); it refuses when the tier or the author needs a person. At high risk the gate stays `draft` after the first approval (`approved_by: Ana`) and opens with the second (`approved_by: Ana, Juan`). Each approval records `approved_sha` and `approved_tier`.
- **When the change grows, the gate opens again.** An approval given at low risk is not enough once the diff makes the change medium: `sdlc/gates` goes back to pending until someone approves.
- **Code approvals are the forge's reviews**, counted by `sdlc ci gate-status` against the tier of the PR's diff. Set branch protection's "required approvals" to 0 and require `sdlc/gates` instead.
- **An approval covers one commit.** A GitHub review is pinned to the commit it was given on. It still counts after commits by trusted authors, gate commits and clean merges; an agent's push, a merge resolved by hand or a force-push invalidates it. On GitLab and Bitbucket, turn on "remove approvals when commits are added" / "reset approvals on changes".
- **The person directing the agent counts as one reviewer** (the PR author, or the intent's author when a bot opened the PR), as long as they are a trusted author. At high risk someone else must approve too.
- **Only trusted authors get the lighter paths.** `risk.trusted_authors` (git name, email or `@login`; unset means everyone in `roles`). Anyone else always needs another person, and the director does not count.
- **An agent's approval never counts**, on artifacts or on the PR.

## Start strict

`risk.profile` defaults to `strict`: every gate still needs a person, and the tier only informs (the PR comment, review depth). Switch to `graded` when you have the numbers to back it: `sdlc metrics` shows human time per PR next to revert and incident rates.

If those rates go up, a [control band with `raise_risk`](../reference/bands.md#circuit-breaker) acts as a circuit breaker: every change is at least `medium` (or `high`) for a while, and the team is notified.
