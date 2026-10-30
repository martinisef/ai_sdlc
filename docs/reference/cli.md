# CLI

```bash
npm i -D @morsadev/sdlc     # project (recommended: the git hooks find it in node_modules)
npm i -g @morsadev/sdlc     # or global
npx sdlc --help
```

Every command works from any directory inside the repository. The project root is resolved from `SDLC_PROJECT_DIR`, then `CLAUDE_PROJECT_DIR`, then `CURSOR_PROJECT_DIR`, then the hook payload's `cwd`, then `git rev-parse --show-toplevel`.

## Setup

| Command | What it does |
|---|---|
| `sdlc init [--yes] [--locale en\|es]` | Detects the stack, VCS and agents; writes `.sdlc/config.json`; scaffolds `changes/`, `lessons/`, `evals/`, `ops/`, `CLAUDE.md`, `REVIEW.md` and `SETUP.md`; runs `sync`. `--yes` accepts what was detected. |
| `sdlc sync [--force] [--dry-run]` | Regenerates the agent files for `agents` (Claude Code, Cursor, AGENTS.md), the `.sdlc/bin/sdlc` shim and the git hooks. Files edited by hand are kept and reported as drift. |
| `sdlc doctor [--json]` | Health checks (config, commands, git hooks, CLI, VCS tool, bands, drift) and the enforcement matrix per agent. Exits 1 on errors. |
| `sdlc migrate` | Moves a legacy `.claude/sdlc.json` to `.sdlc/config.json`. |
| `sdlc schema` | Prints the JSON Schema of `.sdlc/config.json`. |

## Loop

| Command | What it does |
|---|---|
| `sdlc status [--json \| --metrics]` | Changes and their stage. `*` marks the active change (current branch). |
| `sdlc metrics [--json]` | Leading indicators from git and the activity log. |
| `sdlc new <slug> [--ticket KEY] [--title T] [--no-branch]` | Creates `changes/<YYYY-MM>-<slug>/intent.md` (status `draft`) on a new branch `change/<slug>`. |
| `sdlc approve <change> <intent\|spec\|plan> [-m comment]` | Gate decision as a commit. See [Gates](../guide/concepts#gates). |
| `sdlc reject <change> <intent\|spec\|plan> [-m comment]` | The same, setting `status: rejected`. |
| `sdlc lock on\|off\|status` | Test-lock during a fix: test files (`test_globs`) cannot be edited while it is on. |
| `sdlc ui [--port N] [--no-open]` | Local [dashboard](../guide/dashboard) (default port 4319). |

`<change>` accepts the folder (`2026-10-claim-notes` or `changes/2026-10-claim-notes`) or the slug (`claim-notes`).

## Integrations

| Command | What it does |
|---|---|
| `sdlc hook <event> --agent claude\|cursor\|git` | Guardrail entry point, called by the generated hooks. It reads the agent's JSON payload on stdin. |
| `sdlc vcs …` | PR/MR helper for GitHub (`gh`), GitLab (`glab`, or REST) and Bitbucket (REST). |
| `sdlc tracker …` | Jira helper (Cloud or Data Center). |
| `sdlc ci <cmd>` | CI entry point. See [CI](./ci). |
| `sdlc bands check` | Stage 6. See [Control bands](./bands). |
| `sdlc webhook [--port N]` | `@claude` for GitLab and Bitbucket: receives comment webhooks and triggers `sdlc ci mention` in CI. See [CI](./ci#claude-on-gitlab-and-bitbucket). |
| `sdlc hosted [--port N]` | Read-only org board (every repository of a GitHub App installation, by stage and pending gate). See the [hosted RFC](../rfc/hosted). |

### `sdlc vcs`

```text
sdlc vcs provider                                                → github | gitlab | bitbucket
sdlc vcs pr-create --title T --body-file F [--base B] [--draft]  → PR URL
sdlc vcs pr-current                                              → {"number","url","state"} for the current branch
sdlc vcs pr-comment <number> --body-file F
sdlc vcs pr-comments <number>                                    → review comments (JSON lines)
sdlc vcs pr-checks <number>                                      → name<TAB>state per line
```

Bitbucket auth: `BITBUCKET_ACCESS_TOKEN`, or `BITBUCKET_USER` + `BITBUCKET_API_TOKEN`.

### `sdlc tracker`

```text
sdlc tracker enabled                          → exit 0 if tracker.provider = jira
sdlc tracker get KEY                          → {"key","summary","status","type","description","url"}
sdlc tracker transitions KEY                  → available transitions, one per line
sdlc tracker transition KEY <stage|name>      → stage = intent|spec|plan|ship|merged (tracker.transitions)
sdlc tracker comment KEY --body-file F
sdlc tracker create --summary S --body-file F [--type T]   → new key
sdlc tracker set-description KEY --body-file F
sdlc tracker statuses                         → project workflow statuses
```

Auth: `JIRA_EMAIL` + `JIRA_API_TOKEN` (Cloud) or `JIRA_PAT` (Data Center). Exit code 3 means the tracker is not configured.

## Environment

| Variable | Effect |
|---|---|
| `SDLC_BIN` | Command the `.sdlc/bin/sdlc` shim runs (for example `node /path/to/sdlc.mjs`). |
| `SDLC_PROJECT_DIR` | Project root, ahead of everything else. |
| `SDLC_OVERRIDE=<policy>[,<policy>]` | A person overriding a git-hook guardrail. It is recorded. |
| `RELEASE_APPROVAL` (or `production_gate.approval_env`) | Lets commands that match the production gate run. |
| `SDLC_CI_AGENT`, `SDLC_CI_MODEL` | Agent and model for `sdlc ci` and `sdlc bands check`. |
| `EVAL_MIN_PASS_RATE` | Overrides `ci.min_pass_rate`. |
