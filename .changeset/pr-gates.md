---
'@morsadev/sdlc': minor
---

Gates from the PR: `/approve spec` or `/reject plan <reason>` in a PR/MR comment records the gate as a commit on the change branch (`sdlc ci gate`), and `sdlc ci gate-status` sets the `sdlc/gates` commit status to require in branch protection. Roles accept forge users as `@login`. New GitHub template `sdlc-gates.yml`; GitLab and Bitbucket get `sdlc:gate` / `sdlc-gate` jobs triggered by `sdlc webhook` with `SDLC_JOB=gate`.
