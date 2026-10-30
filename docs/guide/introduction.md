# Introduction

`ai-native-sdlc` puts the loop from Anthropic's *AI-Native SDLC Playbook* into a repository. Writing code is no longer the bottleneck. Deciding what to build, and checking that it is right, is. So people sit at the **gates**, and each stage of the loop produces an artifact that the next stage consumes:

```
idea / ticket / incident
  → /sdlc-intent   → intent.md   [gate: Product Owner accepts]
  → /sdlc-spec     → spec.md     [gate: PO + policy owners approve]
  → /sdlc-plan     → plan.md     [gate: engineer / tech lead approves]
  → /sdlc-build    → diff + tests (feedback loop + verifier)
  → /sdlc-ship     → PR / MR     [gate: code owner]
  → /sdlc-incident → new intent.md + lesson + eval   (the loop closes)
```

## What you get

- **Loop skills** for every stage: `sdlc-intent`, `sdlc-spec`, `sdlc-plan`, `sdlc-build`, `sdlc-fix`, `sdlc-ship`, `sdlc-status`, `sdlc-incident`, plus `sdlc-setup` and an example policy skill (`policy-secure-api`).
- **Subagents** for clean-context work: `verifier`, `spec-reviewer`, `researcher`, `simplifier`.
- **Guardrails**: protected paths, secret detection, a test-lock during fixes, a production gate, format-on-edit and a `plan.md` sync check. Agent hooks block actions before they happen, and git hooks back them up for every agent. See [Guardrails](./guardrails).
- **The `sdlc` CLI**: `init`, `sync`, `doctor`, `status`, `new`, `approve`/`reject`, `lock`, and helpers for PRs/MRs (`sdlc vcs`) and Jira (`sdlc tracker`).
- **A local dashboard** (`sdlc ui`): the board of changes, artifact review, gate decisions and settings.
- **CI** for GitHub, GitLab and Bitbucket. The YAML is thin and every job calls `sdlc ci <cmd>`: review with `REVIEW.md`, triage of failed builds, automatic spec from an accepted intent, Jira on merge, and configuration evals. The headless agent can be Claude Code, Codex or Cursor.
- **Stage 6**: `sdlc bands check` watches the metrics in `ops/bands.yaml` with the Western Electric rules. When a band breaks, it logs it, runs a read-only diagnosis, or opens an incident intent, depending on how severe the break is.

## Supported agents

| Agent | What `sdlc sync` generates | Guardrails |
|---|---|---|
| Claude Code | `.claude/settings.json` hooks, `.claude/skills`, `.claude/agents`, or the `ai-sdlc` plugin | hooks block + git hooks |
| Cursor | `.cursor/hooks.json`, `.cursor/rules/ai-sdlc.mdc`, `.cursor/agents`, `.agents/skills` | hooks block + git hooks |
| AGENTS.md (Codex, Copilot, Windsurf, Gemini…) | a managed block in `AGENTS.md`, `.agents/skills`, `.agents/agents` | git hooks + CI |

`sdlc doctor` prints the exact enforcement matrix for the agents in your project.

## Three layers

| Layer | What | Where |
|---|---|---|
| 1 · Managed settings | What is non-negotiable: secrets, sandbox, approved marketplace | admin console / MDM ([Managed settings](./managed-settings)) |
| 2 · `sdlc` + content | Loop skills, subagents, guardrails, CI logic | this repo, published as `@morsadev/sdlc` and the `ai-sdlc` Claude Code plugin |
| 3 · Project | What is specific: `.sdlc/config.json`, `CLAUDE.md`, `REVIEW.md`, CI | each repository |

## Next

- [Quickstart: Claude Code](./quickstart-claude) · [Cursor](./quickstart-cursor) · [AGENTS.md agents](./quickstart-agents-md)
- [The loop](./concepts): changes, artifacts, statuses and gates
- Try it on a real project: [`examples/python-api`](https://github.com/martinisef/ai_sdlc/tree/main/examples/python-api) and [`examples/typescript-lib`](https://github.com/martinisef/ai_sdlc/tree/main/examples/typescript-lib)
