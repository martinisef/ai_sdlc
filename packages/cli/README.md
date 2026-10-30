# @ai-native-sdlc/cli

`sdlc`: the AI-native SDLC loop (intent → spec → plan → build → ship → incident) for Claude Code, Cursor and AGENTS.md agents. It provides human gates recorded in git, guardrails enforced by agent hooks and git hooks, a local dashboard, CI for GitHub, GitLab and Bitbucket, and Stage 6 control bands.

```bash
npm i -D @ai-native-sdlc/cli
npx sdlc init          # config, scaffold, agent files, git hooks
npx sdlc doctor        # health + enforcement matrix per agent
npx sdlc ui            # local dashboard
```

Then run `/sdlc-setup` in your agent, and `/sdlc-intent …` to start a change.

The package is self-contained: one bundled file with no runtime dependencies, plus the skills and the dashboard. It requires Node ≥ 22.18.

Documentation: https://martinisef.github.io/ai_sdlc/ · Source: https://github.com/martinisef/ai_sdlc · License: Apache-2.0
