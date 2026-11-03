---
'@morsadev/sdlc': minor
---

Blocking review. `sdlc ci security` runs a read-only security review (injection and unsafe input, access control, data exposure and secrets) with the same finders, verifier and convergence as `sdlc ci review`. The `sdlc/review` commit status fails while an Important finding, or a security finding other than a pre-existing one, is open; it closes when the next round sees it fixed or a maintainer replies `resolved: <reason>` (`sdlc ci review-status` recomputes it). New `sdlc-security.yml` GitHub template; `sdlc-review.yml` now runs `sdlc ci review` and has a `resolve` job; GitLab and Bitbucket get security and review-status jobs, and `sdlc webhook` forwards `resolved:` replies.
