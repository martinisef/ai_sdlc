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
| `sdlc init [--preset solo\|team-github\|regulated] [--yes] [--no-ci] [--first-change "title"] [--locale en\|es] [--verbose]` | Detects the stack, VCS and agents; applies the preset; writes `.sdlc/config.json`; scaffolds `changes/`, `lessons/`, `evals/`, `ops/`, `CLAUDE.md`, `REVIEW.md` and `SETUP.md`; runs `sync`; installs the CI templates for the detected provider (`sdlc ci install`). Asks three questions (preset, PO, tech lead); `--yes` accepts the defaults. `--first-change` also runs `sdlc new` with that title. |
| `sdlc sync [--force] [--dry-run]` | Regenerates the agent files for `agents` (Claude Code, Cursor, AGENTS.md), the `.sdlc/bin/sdlc` shim and the git hooks. Files edited by hand are kept and reported as drift. |
| `sdlc doctor [--fix] [--json]` | Health checks (config, commands, git hooks, CLI, CI, VCS tool, bands, drift) and the enforcement matrix per agent. Exits 1 on errors. `--fix` repairs what it can, idempotently: migrates a legacy config, runs `sync` (hooks, shim, agent files), fills missing `commands` from the detected stack and runs `sdlc ci install`. What needs a person (credentials, hand-edited files, an invalid config) is listed as `manual` with the command to run. |
| `sdlc migrate` | Moves a legacy `.claude/sdlc.json` to `.sdlc/config.json`. |
| `sdlc schema` | Prints the JSON Schema of `.sdlc/config.json`. |

## Loop

| Command | What it does |
|---|---|
| `sdlc next [--json]` | The one thing to do now, for you: approve a gate (`sdlc approve …`), ask the agent for the next skill, wait for someone, ship, switch to your open change or start one. Gates on other changes that you can decide are listed below. The same line appears in the session-start context, the dashboard and the editor. |
| `sdlc status [--json \| --metrics]` | Changes and their stage. `*` marks the active change (current branch). |
| `sdlc metrics [--json]` | Leading indicators from git and the activity log. |
| `sdlc metrics --funnel [--json]` | How far changes get: started → intent accepted → spec → plan → building → merged, the quick lane apart, and minutes from `sdlc init` to the first change and gate. See [Telemetry](./telemetry). |
| `sdlc telemetry on\|off\|status [--payload]` | Opt-in, anonymous daily counts to `SDLC_TELEMETRY_URL`. Off by default; `DO_NOT_TRACK` disables it. `--payload` prints what would be sent. |
| `sdlc new <slug> [--ticket KEY] [--title T] [--no-branch]` | Creates `changes/<YYYY-MM>-<slug>/intent.md` (status `draft`) on a new branch `change/<slug>`. |
| `sdlc quick "<what>" [--ticket KEY] [--no-branch]` | Quick lane: `intent.md` with `lane: quick` on branch `change/<slug>`, no spec or plan. The pre-push hook checks `quick_lane` limits (default 10 code files; nothing under `risk.high_risk_paths` or `quick_lane.forbid_paths`). |
| `sdlc quick --check [--json]` | Whether the active quick change is still within the limits (exit 1 if not). |
| `sdlc promote [<change>]` | Quick lane → full loop: `lane: full`, intent back to `draft` for the PO. |
| `sdlc risk [<change>] [--base B] [--json]` | Risk tier set by the change, not the author: the diff against the base (paths, weighted size, dependencies, deletions), the paths the spec and plan name, and the declared `risk:`. See [Risk tiers](../guide/risk). |
| `sdlc approve <change> <intent\|spec\|plan> [-m comment] [--auto]` | Gate decision as a commit. See [Gates](../guide/concepts#gates). `--auto` (with `risk.profile: graded`) records the approval when the risk tier needs nobody; see [Risk tiers](../guide/risk#approvals-per-tier). |
| `sdlc reject <change> <intent\|spec\|plan> [-m comment]` | The same, setting `status: rejected`. |
| `sdlc lock on\|off\|status` | Test-lock during a fix: test files (`test_globs`) cannot be edited while it is on. |
| `sdlc ui [--port N] [--no-open]` | Local [dashboard](../guide/dashboard) (default port 4319). |

`<change>` accepts the folder (`2026-10-claim-notes` or `changes/2026-10-claim-notes`) or the slug (`claim-notes`).

## Integrations

| Command | What it does |
|---|---|
| `sdlc hook <event> --agent claude\|cursor\|git` | Guardrail entry point, called by the generated hooks. It reads the agent's JSON payload on stdin. |
| `sdlc vcs …` | PR/MR helper for GitHub (`gh`), GitLab (`glab`, or REST) and Bitbucket (REST). |
| `sdlc tracker …` | Tracker helper: Jira (Cloud or Data Center), GitHub Issues or Linear, per `tracker.provider`. |
| `sdlc ci <cmd>` | CI entry point. See [CI](./ci). |
| `sdlc bands check` | Stage 6. See [Control bands](./bands). |
| `sdlc notify <event> [--change ID] [--artifact A] [--decision D] [--by WHO] [-m NOTE] [--dry-run]` | Posts `gate.pending`, `gate.decided`, `spec.ready`, `review.done` or `change.merged` to Slack or a webhook (`SDLC_NOTIFY_WEBHOOK`). Always exits 0. See [Notifications](../guide/notifications). |
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
sdlc tracker enabled                          → exit 0 if tracker.provider is jira, github or linear
sdlc tracker get KEY                          → {"key","summary","status","type","description","url"}
sdlc tracker transitions KEY                  → available transitions, one per line
sdlc tracker transition KEY <stage|name>      → stage = intent|spec|plan|ship|merged (tracker.transitions)
sdlc tracker comment KEY --body-file F
sdlc tracker create --summary S --body-file F [--type T]   → new key
sdlc tracker set-description KEY --body-file F
sdlc tracker statuses                         → project workflow statuses
```

Keys: `PROJ-123` (Jira), `#123` or `owner/repo#123` (GitHub Issues), `ENG-123` (Linear). On GitHub a transition swaps the `sdlc:<stage>` label and `merged` closes the issue.

Auth: Jira `JIRA_EMAIL` + `JIRA_API_TOKEN` (Cloud) or `JIRA_PAT` (Data Center); GitHub `GH_TOKEN`; Linear `LINEAR_API_KEY`. Exit code 3 means the tracker is not configured. Setup per tracker: [Trackers](./trackers).

## Environment

| Variable | Effect |
|---|---|
| `SDLC_BIN` | Command the `.sdlc/bin/sdlc` shim runs (for example `node /path/to/sdlc.mjs`). |
| `SDLC_PROJECT_DIR` | Project root, ahead of everything else. |
| `SDLC_OVERRIDE=<policy>[,<policy>]` | A person overriding a git-hook guardrail. It is recorded. |
| `RELEASE_APPROVAL` (or `production_gate.approval_env`) | Lets commands that match the production gate run. |
| `SDLC_CI_AGENT`, `SDLC_CI_MODEL` | Agent and model for `sdlc ci` and `sdlc bands check`. |
| `EVAL_MIN_PASS_RATE` | Overrides `ci.min_pass_rate`. |
| `SDLC_NOTIFY_WEBHOOK` (or `notify.webhook_env`) | Where `sdlc notify` and `sdlc ci` post loop events. Unset: no notifications. |
