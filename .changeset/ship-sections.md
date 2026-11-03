---
'@morsadev/sdlc': minor
---

Every PR/MR description needs `## Testing`, `## Risk` (at least the tier `sdlc risk` computes) and `## How to revert` before `sdlc/gates` turns green; Spanish headings count too, and `ci.pr_sections` changes the list (`[]` turns it off). `/sdlc-ship` writes them and reminds the author that they own the change after it lands. Merge queue support: the GitHub templates run on `merge_group`, and `sdlc ci merge-queue` carries `sdlc/gates` and `sdlc/review` to the queue commit once every PR in the group has them green. New guide: "Ship and own it" (feature flags, staged release, merge queue).
