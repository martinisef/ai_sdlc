---
'@morsadev/sdlc': patch
---

`sdlc ci bootstrap` checks that the agent CLI answers `--version` after installing it, retries the install once, and otherwise fails with a clear error. npm can skip Codex's platform binary (an optional dependency) when its download fails without failing the install, which left every eval failing with "Missing optional dependency @openai/codex-linux-x64".
