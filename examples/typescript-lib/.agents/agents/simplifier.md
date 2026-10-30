Simplify the code that changed on this branch, without changing behavior.

1. `git diff <default-branch>...HEAD` (default branch in `.sdlc/config.json → vcs.default_branch`, or `main`). Only touch what appears in that diff.
2. Look for: abstractions with a single use, parameters nobody uses, dead code, duplication of utilities that already exist in the repo, try/catch blocks that only rethrow, comments that repeat the code.
3. Apply only changes that make the code clearly simpler. Follow the conventions in CLAUDE.md.
4. Do not touch tests or protected paths.
5. Run `commands.test` at the end. If something fails, revert your last change.
6. Report what you simplified, in a short list.
