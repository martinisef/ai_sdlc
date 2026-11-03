# Ship and own it

Review gets cheaper when the agent and the reviewers do more of it, but someone still has to own what reaches production. In this loop that is the person who directed the agent: **you land it, you own it**. The reviewers checked the change; they do not watch it roll out, and they do not revert it.

## What every PR says

`/sdlc-ship` writes three sections into the description, and `sdlc/gates` stays red without them:

| Section | What goes in it |
|---|---|
| `## Testing` | What was run and how: build, test and lint output, the verifier's verdict, manual checks. |
| `## Risk` | The tier from `sdlc risk` (low, medium or high) and why. Never lower than the computed tier. |
| `## How to revert` | Revert the PR, turn off a flag, run a migration's down step. Say so when something cannot be undone. |

Spanish headings (`## Pruebas`, `## Riesgo`, `## Cómo revertir`) also count. `ci.pr_sections` changes the list; `[]` turns the check off. The check runs only when everything else in `sdlc/gates` is green, so it never hides a pending gate.

## Roll out in steps

Merging is not releasing. For anything above low risk, separate the two:

- **Feature flags.** Put new behavior behind a flag that is off by default, merge, then turn it on for a few users, then everyone. "How to revert" becomes "turn the flag off", which takes seconds and needs no deploy. Remove the flag in a later change once it is fully on.
- **Staged release.** Deploy to a canary or a small percentage first, compare its error rate and latency with the rest, then widen. The [control bands](../reference/bands) (`sdlc bands check`) watch the same metrics after the merge.
- **Irreversible steps.** Data migrations, external calls and published contracts cannot be reverted with the PR. Split them out: an additive migration first, the code that uses it next, the cleanup last.

## Merge queue

With many agent PRs, a [merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) tests each PR on top of the ones ahead of it, so two green PRs cannot break `main` together.

1. Turn it on in the branch protection rule (or ruleset) of the default branch.
2. The templates already run on `merge_group`: `ci.yml` builds and tests the queue commit, and the `queue` job in `sdlc-gates.yml` runs `sdlc ci merge-queue`, which sets `sdlc/gates` and `sdlc/review` on the queue commit once every PR in the group has them green.
3. Keep `sdlc/gates`, `sdlc/review` and the build required. A PR enters the queue only when they are green on its head commit.

GitLab has merge trains and Bitbucket has merge checks; both run the pipeline on the merged result, where `sdlc/gates` and `sdlc/review` are set as usual.

## After the merge

- Watch the rollout until the change is fully on. If it misbehaves, follow "How to revert" first and investigate after.
- An incident goes through `/sdlc-incident`: it opens a change with the timeline, and the fix comes with a test that reproduces it.
- A revert is a signal, not a failure. The [metrics](../reference/telemetry) count reverts per change; frequent ones mean the tier or the review missed something.
