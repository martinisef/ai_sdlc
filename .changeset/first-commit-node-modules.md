---
'@morsadev/sdlc': patch
---

`sdlc init` adds `node_modules/` to `.gitignore` when it is not ignored yet, so the first `git add -A` no longer commits the installed packages. The secrets guardrail no longer treats a quoted environment variable name (`"OPENAI_API_KEY"`) as a credential.
