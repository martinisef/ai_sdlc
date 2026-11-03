---
'@morsadev/sdlc': minor
---

The reviewer learns from its misses. `sdlc ci capture-eval <commit> --origin incident --expect "<finding>"` turns the commit behind an incident into a reviewer eval (a patch that the review must flag as Important), and `--reverts` does the same for every reverted commit; `/sdlc-incident` runs it when a merged commit is the cause. New `output_matches` eval check, and three clean-PR evals that measure false positives. `sdlc metrics --prs` records what happened to each review finding (fixed, wrong, intentional, ignored, open; `resolved: wrong …` marks a false positive), and the agent scorecard shows the reviewer apart: clean PRs, problems caught and comment outcomes.
