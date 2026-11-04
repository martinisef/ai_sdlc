# Install

About 10 minutes the first time. You type the commands in a **terminal**: Terminal on macOS, your terminal app on Linux, or Ubuntu (WSL) on Windows.

![Installing and checking the setup](../media/install-en.gif)

## 1. Check what you already have

Run each command. If it prints a version like the one shown, that item is ready.

| You need | Check with | You should see | If not |
|---|---|---|---|
| Node.js 22.18 or newer | `node -v` | `v22.18.0` or higher (`v24.x` is fine) | Install the LTS version from [nodejs.org](https://nodejs.org) |
| git | `git --version` | `git version 2.x` | macOS: `xcode-select --install` · Linux: `sudo apt install git` |
| Your name in git | `git config user.name` | your name | `git config --global user.name "Your Name"` and `git config --global user.email you@example.com` |
| An agent | `claude --version`, or Cursor open | a version | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Cursor](https://cursor.com) |

Your git name matters: every approval is recorded with it, and the tool refuses approvals from names that look like an agent or a bot.

### On Windows

Use WSL (Windows Subsystem for Linux): open PowerShell as administrator, run `wsl --install`, restart, and open "Ubuntu" from the Start menu. From then on follow the Linux instructions inside Ubuntu.

## 2. Get a project to try it on

To learn, use the tiny example app. It is a to-do list with three tests and nothing else.

```bash
git clone --depth 1 https://github.com/martinisef/ai_sdlc.git
cp -r ai_sdlc/examples/starter-todo ~/my-todo
cd ~/my-todo
git init -b main
git add -A && git commit -m "initial"
npm test
```

`npm test` should end with `pass 3`. Your own project works the same way: skip this step and `cd` into it instead.

## 3. Install the tool

```bash
npm i -D @morsadev/sdlc
npx sdlc init --preset solo
```

- `npm i -D` adds the tool to this project only (in `node_modules/`). Nothing is installed system-wide.
- `npx sdlc` runs it. Every command in these pages starts with `npx sdlc`.
- `init` asks which agents you use. Press Enter for the suggestion, or type `claude`, `cursor` or both (`claude,cursor`).
- `--preset solo` means you work alone: you approve your own changes. For a team, use `--preset team-github`; it asks who approves what.

When it finishes you will see something like:

```text
✓ ai-sdlc ready · preset solo · typescript · agents: claude
  config   .sdlc/config.json (10 scaffold files, 57 agent files; --verbose lists them)
  gates    any person (never an agent)
  CI       no remote detected: `sdlc ci install --provider github|gitlab|bitbucket` later
Next: sdlc next (it always tells you what to do), or sdlc new <slug> to start a change.
```

Line by line:

| Line | Meaning |
|---|---|
| `✓ ai-sdlc ready · preset solo · typescript · agents: claude` | It worked. It detected a JavaScript/TypeScript project and set it up for Claude Code. |
| `config .sdlc/config.json` | Your settings. You can edit them later, by hand or in the dashboard. |
| `10 scaffold files` | `changes/` (where changes live), `CLAUDE.md` (notes for the agent), `REVIEW.md`, `lessons/`, `evals/`, `ops/`. |
| `57 agent files` | The skills and hooks for your agent, in `.claude/` (Claude Code) or `.cursor/` and `.agents/` (Cursor). |
| `gates any person (never an agent)` | Who may approve: any person, including you. Never an AI. |
| `CI no remote detected` | It did not find GitHub or GitLab. That is fine for learning; you can add it later. |

## 4. Save it in git

```bash
git add -A && git commit -m "chore: ai-sdlc"
```

## 5. Check that it works

```bash
npx sdlc doctor
```

Every line should start with `✓`. A `!` is a warning, not an error; for example `! VCS provider unknown` only means there is no GitHub or GitLab remote yet. `npx sdlc doctor --fix` repairs what it can. If something is still wrong, see [Troubleshooting](./troubleshooting.md).

Next: [Tutorial: your first change](./tutorial.md). Does your team use Jira? You can [connect it](./jira.md) now or later.
