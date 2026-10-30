# Quickstart: Cursor

Requirements: Node ≥ 22.18, git and Cursor. For PRs and MRs you also need `gh` or `glab`.

## 1. Install and initialize

```bash
cd your-repo
npm i -D @ai-native-sdlc/cli
npx sdlc init                 # pick "cursor" among the agents (it is detected when .cursor/ exists)
```

For Cursor, `sdlc sync` writes:

| File | What |
|---|---|
| `.cursor/hooks.json` | `sessionStart`, `preToolUse` (Write/Delete), `beforeShellExecution`, `beforeReadFile`, `beforeSubmitPrompt`, `afterFileEdit` and `stop`, all calling `.sdlc/bin/sdlc hook … --agent cursor`. Hooks you already had are kept. |
| `.cursor/rules/ai-sdlc.mdc` | An always-applied rule with how the loop works and the list of stages. |
| `.agents/skills/sdlc-*` | The loop skills. Cursor offers them as `/sdlc-intent`, `/sdlc-spec`, and so on. |
| `.cursor/agents/*` | The subagents. `researcher` and `spec-reviewer` are read-only. |

It also installs the git hooks. Commit everything except what `.sdlc/.gitignore` excludes.

```bash
npx sdlc doctor
```

## 2. Finish the setup

Open the repo in Cursor and, in the agent chat, run `/sdlc-setup`. It fills in `REVIEW.md` and the CI and lists the manual steps in `SETUP.md`. `CLAUDE.md` holds the project conventions for every agent. Cursor reads it through the rule.

## 3. Work the loop

```text
/sdlc-intent Adjusters need to add notes to a claim
```

Accept the intent with `npx sdlc approve <change> intent`, or in the dashboard (`npx sdlc ui`). Then continue with `/sdlc-spec`, `/sdlc-plan`, `/sdlc-build` and `/sdlc-ship`.

## What blocks in Cursor

The Cursor hooks block the same things as Claude Code before they happen:

- writing to protected paths;
- secrets in file content;
- editing tests while the test-lock is on;
- shell commands that match the production gate.

Cursor has two extra hooks:

- `beforeReadFile` refuses to load a file whose content contains a credential.
- `beforeSubmitPrompt` stops a prompt that contains one.

The git hooks repeat the path, secret and test-lock checks at commit time. Run `npx sdlc doctor` to see the matrix.

## Cursor in CI

`sdlc ci` can drive `cursor-agent` headless. Set `ci.agent: "cursor"` in `.sdlc/config.json` (or `SDLC_CI_AGENT=cursor`) and the `CURSOR_API_KEY` secret. See [CI](../reference/ci).
