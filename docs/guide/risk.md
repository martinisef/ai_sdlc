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

## Start strict

`risk.profile` defaults to `strict`: every gate still needs a person, and the tier only informs (the PR comment, review depth). Switch to `graded` when you have the numbers to back it: `sdlc metrics` shows human time per PR next to revert and incident rates.
