# Quickstart: AGENTS.md agents

This covers Codex, GitHub Copilot, Windsurf, Gemini CLI, and any other agent that reads `AGENTS.md`.

## 1. Install and initialize

```bash
cd your-repo
npm i -D @ai-native-sdlc/cli
npx sdlc init                 # pick "agents-md" among the agents
```

`sdlc sync` writes:

- **A managed block in `AGENTS.md`**, between `<!-- ai-sdlc:start -->` and `<!-- ai-sdlc:end -->`. It explains how the loop works and lists every stage with the path to its skill. The rest of `AGENTS.md` is yours, and `sync` never touches it.
- **`.agents/skills/sdlc-*/SKILL.md`**: the loop skills. The agent reads the matching one when you ask for a stage, for example "run sdlc-spec for 2026-10-claim-notes" or `/sdlc-spec`.
- **`.agents/agents/*.md`**: instructions for clean-context reviews (verifier, spec-reviewer, simplifier, researcher).
- **Git hooks**: `pre-commit` and `pre-push`.

## 2. What is enforced

These agents have no hook API that `sdlc` can use, so enforcement moves to git and CI:

| Guardrail | Enforcement |
|---|---|
| Protected paths, secrets, test-lock | `pre-commit` refuses the commit |
| Plan before code | `pre-push` refuses code on a `change/*` branch without an approved `plan.md` |
| Production gate | CI, plus the instructions in `AGENTS.md` |
| Format on edit, `plan.md` sync | advisory (instructions) |

`npx sdlc doctor` prints this matrix for your project. For hard blocking *before* the action, use the agent's own sandbox and approval settings alongside it.

## 3. Codex in CI

`sdlc ci` drives `codex exec`. It runs with `--sandbox read-only` for reviews and with `workspace-write` when it has to edit. Set `ci.agent: "codex"` and the `OPENAI_API_KEY` secret. See [CI](../reference/ci).
