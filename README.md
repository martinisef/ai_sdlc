# ai-native-sdlc

The loop from Anthropic's *AI-Native SDLC Playbook*, in your repository: agents produce each artifact, people own the gates, and guardrails keep both honest. It works with **Claude Code**, **Cursor** and any agent that reads **AGENTS.md** (Codex, Copilot, Windsurf, Gemini…).

```
idea / ticket / incident
  → /sdlc-intent   → intent.md   [gate: Product Owner]
  → /sdlc-spec     → spec.md     [gate: PO + policy owners]
  → /sdlc-plan     → plan.md     [gate: engineer / tech lead]
  → /sdlc-build    → diff + tests (feedback loop + verifier)
  → /sdlc-ship     → PR / MR     [gate: code owner]
  → /sdlc-incident → new intent.md + lesson + eval   (the loop closes)
```

## Quickstart

```bash
cd your-repo
npm i -D @morsadev/sdlc
npx sdlc init        # detect stack, VCS and agents; write .sdlc/config.json; scaffold; generate agent files + git hooks
npx sdlc doctor      # health checks + what each guardrail enforces, per agent
```

Then open your agent in the repository and run `/sdlc-setup` to finish `CLAUDE.md`, `REVIEW.md` and CI. Start a change with `/sdlc-intent …`, and decide gates with `npx sdlc approve <change> <intent|spec|plan>` or in the dashboard (`npx sdlc ui`).

Claude Code users can also install the plugin: `/plugin marketplace add martinisef/ai_sdlc`, then `/plugin install ai-sdlc@ai-native-sdlc`.

## What you get

- **Loop skills** for every stage, plus `sdlc-setup`, and **subagents** (`verifier`, `spec-reviewer`, `researcher`, `simplifier`).
- **Human gates recorded in git.** An approval is a commit made with the approver's identity, and agents and bots cannot approve.
- **Guardrails**: protected paths, secrets, a test-lock during fixes, a production gate, format-on-edit, plan sync and plan-before-code. Agent hooks block before the action, and git hooks back them up for every agent.
- **A local dashboard** (`sdlc ui`): inbox, board, artifact review, metrics, activity, health and settings.
- **CI for GitHub, GitLab and Bitbucket**: review with `REVIEW.md`, triage of failed builds, accepted intent → spec, Jira on merge, and evals. The headless agent can be Claude Code, Codex or Cursor.
- **Stage 6 control bands** (`sdlc bands check`): Western Electric rules over your metrics. Depending on the tier, a break is logged, diagnosed by the agent read-only, or turned into an incident intent with a draft PR.
- **English and Spanish** content (`locale`).

## Documentation

**[martinisef.github.io/ai_sdlc](https://martinisef.github.io/ai_sdlc/)**, built from [`docs/`](docs/) (`npm run docs:dev` locally):

- [Introduction](docs/guide/introduction.md), with quickstarts for [Claude Code](docs/guide/quickstart-claude.md), [Cursor](docs/guide/quickstart-cursor.md) and [AGENTS.md agents](docs/guide/quickstart-agents-md.md)
- [The loop](docs/guide/concepts.md), [Guardrails](docs/guide/guardrails.md), [Dashboard](docs/guide/dashboard.md)
- [Team guide](docs/guide/team.md), [Platform guide](docs/guide/platform.md), [Managed settings](docs/guide/managed-settings.md)
- Reference: [CLI](docs/reference/cli.md), [configuration](docs/reference/config.md), [CI](docs/reference/ci.md), [control bands](docs/reference/bands.md), [evals](docs/reference/evals.md)
- Español: [docs/es](docs/es/index.md)

## Examples

- [`examples/python-api`](examples/python-api): a claims API (Python, uv, pytest, ruff) with protected migrations and a high-risk state machine.
- [`examples/typescript-lib`](examples/typescript-lib): a money library (TypeScript, bigint) with generated code and a known bug to fix.

Both are initialized with `sdlc` for all three agents, and the product evals in [`evals/`](evals/) run against them.

## Repository layout

| Path | What |
|---|---|
| `packages/core` | config, changes and gates, policies (guardrails), git, VCS, Jira, bands, metrics |
| `packages/adapters` | `sdlc sync` renderers (Claude Code, Cursor, AGENTS.md), hook adapters, git hooks, doctor |
| `packages/server`, `packages/ui` | the local dashboard (Hono + React) |
| `packages/cli` | the `sdlc` CLI, bundled into one file and published as `@morsadev/sdlc` |
| `content/{en,es}` | skills, subagents, scaffold and CI templates (the source; `en` first) |
| `plugins/ai-sdlc` | the Claude Code plugin, **generated** by `npm run build` |
| `evals/`, `examples/` | product evals and the projects they run on |
| `managed-settings/` | example Claude Code managed settings |

## Development

```bash
npm ci
npm run typecheck && npm test && npm run test:bash
npm run build                 # UI + CLI bundle + plugins/ai-sdlc (commit the plugin)
npm run e2e                   # lifecycle, hooks and git hooks on a copy of examples/python-api (+ live claude -p when available)
npm run check:pack            # pack, install in a scratch project, init, doctor
npx changeset                 # describe user-facing changes; the release workflow versions and publishes
```

Node ≥ 22.18. The TypeScript sources run directly (`--conditions=source`), with no build step for tests.

## License

[Apache-2.0](LICENSE)
