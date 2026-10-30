---
"@ai-native-sdlc/cli": minor
---

`@claude` on GitLab and Bitbucket: `sdlc webhook` receives MR/PR comment webhooks and triggers the new `sdlc:mention` job / `sdlc-mention` custom pipeline, where `sdlc ci mention` answers the comment (read-only by default; `ci.mention_mode: edit` lets it commit within the approved plan).
