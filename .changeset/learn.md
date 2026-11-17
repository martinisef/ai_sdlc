---
'@morsadev/sdlc': minor
---

Learnings: when you correct the agent in a way that should hold next time, the loop skills ask "Keep that for next time?" and run the new `sdlc learn "<rule>" [--change C] [--stage S]`, which adds one dated line under **Things Claude gets wrong** in `CLAUDE.md` (and in `AGENTS.md`, outside the block `sdlc sync` regenerates). Duplicates are kept once, lines that look like secrets are refused, `sdlc learn list` shows them and `sdlc doctor` warns past 30. `/sdlc-ship` uses it for the "same mistake twice" rule. Guide: [Learnings](https://martinisef.github.io/ai_sdlc/guide/concepts#learnings).
