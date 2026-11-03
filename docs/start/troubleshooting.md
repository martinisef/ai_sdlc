# Troubleshooting

Find the message you see, then do what the right-hand side says. When in doubt, run `npx sdlc doctor --fix`: it repairs what it can and tells you what it cannot.

## Installing

| You see | It means | Do this |
|---|---|---|
| `npm WARN EBADENGINE` or a syntax error when running `npx sdlc` | Your Node.js is older than 22.18. | `node -v`; install the LTS version from [nodejs.org](https://nodejs.org) and open a new terminal. |
| `sdlc: command not found` | You typed `sdlc` without `npx`. | Use `npx sdlc …`, or install it globally with `npm i -g @morsadev/sdlc`. |
| `This repo is not set up for the loop → sdlc init` | You are in a folder without the tool. | `cd` into your project, or run `npx sdlc init`. |
| `✗ not a git repository` (in `doctor`) | The folder is not a git repository. | `git init -b main && git add -A && git commit -m initial`, then `npx sdlc init` again. |
| `ai-sdlc: sdlc CLI not found (npm i -D @morsadev/sdlc); guardrail skipped` | The project has the tool's files but not the tool (for example after a fresh clone). | `npm install` (or `npm i -D @morsadev/sdlc`). |
| `! VCS provider unknown` | There is no GitHub, GitLab or Bitbucket remote. | Fine for trying it out. For pull requests, add the remote (`git remote add origin …`) and run `npx sdlc ci install --provider github`. |
| `! generated files edited by hand: …` | Someone edited a file the tool generates (skills, hooks). | `npx sdlc sync --force` regenerates them. Put your own notes in `CLAUDE.md` instead. |

## Approving

| You see | It means | Do this |
|---|---|---|
| `… looks like an agent or bot; a person must approve` | Your git name or email is the agent's (for example `Claude <noreply@anthropic.com>`). | Set your own: `git config user.name "Your Name"` and `git config user.email you@example.com`, then approve again. |
| `sdlc: changes/…/spec.md does not exist` | You tried to approve a document the agent has not written yet. | `npx sdlc next` says which one is pending; ask the agent for it (`/sdlc-spec`). |
| `sdlc: change not found: …` | The change name is wrong. | `npx sdlc status` lists the names. You can use the short name (`mark-done`). |
| `… authored spec.md; another person must approve it` | In a team preset, the author of a spec or plan cannot approve it. | Ask a teammate; they see it in the dashboard Inbox. |
| `plan needs approval from: …` | The preset says who approves each document, and it is not you. | Ask one of the people listed. |
| `git user.name / user.email is not set` | git does not know who you are. | `git config --global user.name "Your Name"` and `git config --global user.email you@example.com`. |

## While the agent works

| You see | It means | Do this |
|---|---|---|
| `Blocked by ai-sdlc: branch change/… has code changes but …/plan.md is not approved` | Code was pushed before the plan was approved. | Finish `/sdlc-plan` and `npx sdlc approve <change> plan`, then push again. |
| `Blocked by ai-sdlc: '…' is a protected path` | The file is generated or sensitive (`protected_paths` in `.sdlc/config.json`). | Do not work around it. Note it in `plan.md` and ask a code owner. |
| `Blocked by ai-sdlc: the content looks like it contains a credential` | The agent tried to write something that looks like a key or password. | Read it from an environment variable instead. In test data, use a value that does not look real. |
| `test-lock ON: test files cannot be edited` | A bug fix is in progress (`/sdlc-fix`): the test is the spec. | Fix the code, not the test. `npx sdlc lock off` when the fix is done. |
| `promote it (sdlc promote …): … is a high-risk path` | A quick change touched something risky, or grew past 10 code files. | `npx sdlc promote`: the change goes through intent, spec and plan. |
| The agent does not know `/sdlc-…` | The agent files are missing or the agent was open before `init`. | Restart the agent session. If it still fails, `npx sdlc sync` and check `npx sdlc doctor`. |

## Undoing

- **An approval by mistake:** `npx sdlc reject <change> <intent|spec|plan> -m "why"` records the rejection. Ask the agent to revise the document, then approve it again.
- **A change you no longer want:** `git checkout main`, then delete its branch (`git branch -D change/<name>`) and its folder in `changes/`.
- **The whole tool:** delete `.sdlc/`, `changes/`, the agent folders it created (`.claude/skills/sdlc-*`, `.agents/`) and run `git config --unset core.hooksPath`.

Still stuck? Open an issue at [github.com/martinisef/ai_sdlc](https://github.com/martinisef/ai_sdlc/issues) with the output of `npx sdlc doctor`.
