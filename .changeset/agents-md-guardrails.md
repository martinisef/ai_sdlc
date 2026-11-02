---
"@morsadev/sdlc": minor
---

AGENTS.md now carries the guardrails as rules (protected paths, production gate, secrets, test-lock), generated from `.sdlc/config.json`: agents without hooks (Codex, Copilot, …) were not told about them. The loop text also states the "small change outside the loop" exception. `sdlc ci evals` runs with `--agent codex|cursor` (slash prompts become the rendered skill; Codex can commit on CI runners).
