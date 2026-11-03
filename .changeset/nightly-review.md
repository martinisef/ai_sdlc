---
'@morsadev/sdlc': minor
---

`sdlc ci nightly-review` reviews the code nobody is changing: one module per night, in rotation (`ci.nightly.modules`, else every code directory), with the review's finders and a verifier. Each Important finding becomes an intent (`origin: review`) on its own `change/review-*` branch, with a draft PR when run with `--pr`. The same finding never gets a second intent, and a night opens at most `ci.nightly.max_intents` (3). New templates: `sdlc-nightly-review.yml` (GitHub, in the regulated preset), `sdlc:nightly-review` (GitLab) and the `nightly-review` custom pipeline (Bitbucket). The same job turns the week's reverted commits into reviewer evals.
