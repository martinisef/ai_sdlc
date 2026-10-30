# Quickstart: Claude Code

Requirements: Node ≥ 22.18, git, and Claude Code. For PRs and MRs you also need `gh` (GitHub) or `glab` (GitLab). Bitbucket uses its REST API, so it needs no extra tool.

## 1. Install and initialize

```bash
cd your-repo
npm i -D @morsadev/sdlc     # or: npm i -g @morsadev/sdlc
npx sdlc init
```

`sdlc init` detects the stack, the VCS provider and the agents in use, asks you to confirm, and then does three things:

1. Writes `.sdlc/config.json`, the [configuration](../reference/config).
2. Scaffolds `changes/`, `lessons/`, `evals/`, `ops/bands.yaml`, `CLAUDE.md`, `REVIEW.md` and `SETUP.md`.
3. Runs `sdlc sync`, which generates the agent files and installs the git hooks (`core.hooksPath=.sdlc/git-hooks`).

For Claude Code, the sync step writes:

- `.claude/settings.json`: `SessionStart`, `PreToolUse`, `PostToolUse` and `Stop` hooks, all calling `.sdlc/bin/sdlc hook … --agent claude`. Any hooks you already had are kept.
- `.claude/skills/sdlc-*`: the loop skills, available as `/sdlc-intent`, `/sdlc-spec`, and so on.
- `.claude/agents/*`: `verifier`, `spec-reviewer`, `researcher`, `simplifier`.

Commit all of it; it is shared by the team. The `.sdlc/bin/sdlc` shim looks for the CLI in `SDLC_BIN`, then `node_modules/.bin`, then your `PATH`. If none of them has it, the hooks **fail open**, and `sdlc doctor` reports that.

::: tip Plugin instead of project files
If your organization publishes the marketplace ([platform guide](./platform)), set `plugin.marketplace_repo` in `.sdlc/config.json`. `sdlc sync` then writes `extraKnownMarketplaces` and `enabledPlugins` to `.claude/settings.json` instead of copying the skills into the repo. The `ai-sdlc` plugin brings its own hooks and a bundled CLI.

```text
/plugin marketplace add martinisef/ai_sdlc
/plugin install ai-sdlc@ai-native-sdlc
```
:::

## 2. Check

```bash
npx sdlc doctor
```

This checks the config, the commands, the git hooks and the CLI, and prints the enforcement matrix (what *blocks* and what is only *advisory*, per agent).

## 3. Finish the setup with the agent

```bash
claude
> /sdlc-setup
```

`/sdlc-setup` fills in `CLAUDE.md` and `REVIEW.md`, installs the CI templates for your provider and leaves anything manual (secrets, branch protection, CODEOWNERS) in `SETUP.md`.

## 4. Your first change

```text
> /sdlc-intent Customers should get an email when their claim changes status
```

The skill creates `changes/<YYYY-MM>-<slug>/intent.md` on the branch `change/<slug>`. The Product Owner reviews it and accepts it:

```bash
npx sdlc approve 2026-10-claim-emails intent -m "go"     # or in the dashboard: npx sdlc ui
```

Then continue the loop:

```text
> /sdlc-spec        # PO approves spec.md
> /sdlc-plan        # engineer approves plan.md (tech lead too when risk: high)
> /sdlc-build
> /sdlc-ship
```

Gate decisions are commits made with the approver's git identity. Identities that look like agents or bots (Claude, Cursor, Codex, `[bot]`…) are refused. See [The loop](./concepts#gates).

## Headless

Every skill also works with `claude -p`, which is how `sdlc ci` drives it in CI:

```bash
claude -p "/sdlc-spec 2026-10-claim-emails. Headless: do not ask questions; record anything uncertain as an open question." \
  --permission-mode acceptEdits --allowedTools "Read,Write,Edit,Grep,Glob,Bash(git status),Bash(.sdlc/bin/sdlc:*)"
```

The guardrails apply the same way in headless runs.
