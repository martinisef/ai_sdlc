---
'@morsadev/sdlc': minor
---

Agent parity: `sdlc ci evals --tags a,b` runs only the evals with those tags, `sdlc ci matrix` lists the agents with credentials, and `sdlc ci scorecard <reports…>` renders the eval × agent table into `docs/reference/agent-scorecard.md`, rewriting it only when a result changed. Headless Cursor runs use `agent` (or `cursor-agent`) with `--trust`, `--mode ask` for read-only tasks and `--workspace`, and `sdlc ci bootstrap` adds `~/.local/bin` to the job's PATH after installing it.
