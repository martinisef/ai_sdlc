# Running a pilot

A 2–4 week pilot with one team, on one real repository, tells you whether the loop pays off before you roll it out.

## Before day 1

- [ ] Pick a team of 3–8 people, with a PO who will own the intent and spec gates, and a repository with CI.
- [ ] `npx -y @morsadev/sdlc@0 init` in the repository, then review `.sdlc/config.json`. Fill in `roles` with real usernames, set `gates`, and keep the default `bands`.
- [ ] `sdlc sync`, then commit the generated files in a PR the team reviews.
- [ ] Set up CI with the per-provider guide ([GitHub](../reference/ci-github), [GitLab](../reference/ci-gitlab), [Bitbucket](../reference/ci-bitbucket)).
- [ ] Record a baseline from the last 4–8 weeks of history: lead time from ticket to merge, the share of PRs reopened or reverted, and review rounds per PR.

## During the pilot

- Every change that is not trivial goes through intent, spec, plan and build. Trivial changes can go outside the loop when someone asks explicitly, but they get no traceability, so count how many there are.
- In a weekly 15-minute check, run `sdlc metrics` and look at the gates inbox in `sdlc ui`:
  - Is anything waiting on a gate for more than a day?
  - Which specs were rejected, and why?
- Every incident or rework becomes a lesson (`lessons/`) and, when it can be checked mechanically, an eval (`evals/`). See [Evals](../reference/evals).

## Retro (end of the pilot)

| Question | Source |
|---|---|
| Did lead time go down, stay flat or go up? | `sdlc metrics` vs. the baseline |
| How many specs needed rework, and at which gate? | `sdlc metrics`, rejected gates |
| Did the agent stay within the approved plan? | review comments, `sdlc ci review` findings |
| What did people work around? | the retro itself |

Write each decision as a changeset (`npm run changeset`) or an issue: new defaults, template wording, evals that should ship with the product. Then decide whether to expand to a second team, adjust and repeat, or stop.
