# @ai-native-sdlc/cli

## 0.3.0

### Minor Changes

- 6b20ab0: First public release: the `sdlc` CLI with adapters for Claude Code, Cursor and AGENTS.md, the local dashboard (`sdlc ui`), CI for GitHub, GitLab and Bitbucket (`sdlc ci`), Stage 6 control bands (`sdlc bands check`) and product evals.
- 5bbe966: `sdlc hosted`: read-only org board over a GitHub App installation (phase 1 of `docs/rfc/hosted.md`). Same stage rules as `sdlc status`, per-repo TTL cache dropped by push webhooks, optional viewer token.
- 5bbe966: `@claude` on GitLab and Bitbucket: `sdlc webhook` receives MR/PR comment webhooks and triggers the new `sdlc:mention` job / `sdlc-mention` custom pipeline, where `sdlc ci mention` answers the comment (read-only by default; `ci.mention_mode: edit` lets it commit within the approved plan).
