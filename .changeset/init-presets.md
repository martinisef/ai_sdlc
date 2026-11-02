---
'@morsadev/sdlc': minor
---

One-step setup: `sdlc init --preset solo|team-github|regulated` asks three questions (preset, PO, tech lead), installs the CI templates for the detected provider and prints a five-line summary. `--first-change "title"` also creates the first intent. New `sdlc ci install` copies the pipeline templates with the stack setup filled in, without overwriting. New config `gates_self_approval` (preset `solo`) lets the author approve their own spec and plan.
