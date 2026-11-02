# @morsadev/sdlc

## 0.4.1

### Patch Changes

- bdd9513: Security: `@hono/node-server` 2.x (GHSA-rmxm-3fg6-px4f). The dashboard only serves files inside the built UI directory (a sibling directory with the same prefix no longer passes the check) and compares its token in constant time.

## 0.4.0

### Minor Changes

- 9025457: AGENTS.md now carries the guardrails as rules (protected paths, production gate, secrets, test-lock), generated from `.sdlc/config.json`: agents without hooks (Codex, Copilot, …) were not told about them. The loop text also states the "small change outside the loop" exception. `sdlc ci evals` runs with `--agent codex|cursor` (slash prompts become the rendered skill; Codex can commit on CI runners).
- ea971af: `sdlc doctor --fix` repairs what it can, idempotently: migrates a legacy config, runs `sync`, fills missing commands from the detected stack and installs CI. What needs a person is listed as `manual` with the command to run. New doctor check `ci`: warns when no pipeline calls `sdlc`.
- 9077b99: Agent parity: `sdlc ci evals --tags a,b` runs only the evals with those tags, `sdlc ci matrix` lists the agents with credentials, and `sdlc ci scorecard <reports…>` renders the eval × agent table into `docs/reference/agent-scorecard.md`, rewriting it only when a result changed. Headless Cursor runs use `agent` (or `cursor-agent`) with `--trust`, `--mode ask` for read-only tasks and `--workspace`, and `sdlc ci bootstrap` adds `~/.local/bin` to the job's PATH after installing it.
- 588f6ff: `sdlc metrics --funnel` shows how far changes get through the loop (and the quick lane), plus minutes from `sdlc init` to the first change and gate. Opt-in telemetry: `sdlc telemetry on|off|status [--payload]`, off by default, sends anonymous daily counts only to `SDLC_TELEMETRY_URL`, respects `DO_NOT_TRACK`. New activity events `setup.init` and `setup.fix`.
- 28cb036: One-step setup: `sdlc init --preset solo|team-github|regulated` asks three questions (preset, PO, tech lead), installs the CI templates for the detected provider and prints a five-line summary. `--first-change "title"` also creates the first intent. New `sdlc ci install` copies the pipeline templates with the stack setup filled in, without overwriting. New config `gates_self_approval` (preset `solo`) lets the author approve their own spec and plan.
- e958faf: Notifications: `sdlc notify <event>` posts `gate.pending`, `gate.decided`, `spec.ready`, `review.done` and `change.merged` to Slack or any webhook (Teams, Discord with `format: generic`), mentioning whoever has to act. `sdlc ci intent-to-spec`, `gate`, `gate-status`, `review` and `jira-merged` send them when `SDLC_NOTIFY_WEBHOOK` is set; new `notify` config (`webhook_env`, `format`, `events`, `people`). Fail-open.
- 089fe66: Gates from the PR: `/approve spec` or `/reject plan <reason>` in a PR/MR comment records the gate as a commit on the change branch (`sdlc ci gate`), and `sdlc ci gate-status` sets the `sdlc/gates` commit status to require in branch protection. Roles accept forge users as `@login`. New GitHub template `sdlc-gates.yml`; GitLab and Bitbucket get `sdlc:gate` / `sdlc-gate` jobs triggered by `sdlc webhook` with `SDLC_JOB=gate`.
- 64ecf28: Quick lane for small, low-risk changes: `sdlc quick "<what>"` creates an intent with `lane: quick` (stage `quick-ready`, no spec or plan) and the new `/sdlc-quick` skill implements it with tests. The pre-push hook enforces `quick_lane` limits (default 10 code files, nothing under `risk.high_risk_paths` or `quick_lane.forbid_paths`); `sdlc quick --check` reports them and `sdlc promote` moves the change to the full loop.
- 51de87a: `sdlc next [--json]` says the one thing to do now for the person asking: approve a gate they can decide, run the next skill, wait for a named person, ship, or start a change. The session-start context and a new bar in the dashboard show the same line.
- f6f11a8: Go, .NET and Ruby on Rails stacks: `sdlc init` detects `go.mod`, a `.sln` or `.csproj` at the root, and a `Gemfile` with `config/application.rb` (before `package.json`, since these apps often carry a frontend), and fills in commands, test globs and protected paths from the new `stacks/{go,dotnet,ruby}.md` guides (en and es), including the CI setup that `sdlc ci install` uses. New `append_only_paths` config: matching files can be created but not edited once they exist, so applied migrations (`db/migrate/**`, EF Core `Migrations/`) only grow. The agent hooks and the git pre-commit enforce it.
- e60e31a: Trackers: GitHub Issues and Linear join Jira behind one `Tracker` interface (`tracker.provider: github | linear`). GitHub follows the loop with `sdlc:<stage>` labels and closes the issue on merge (`GH_TOKEN`); Linear moves workflow states over GraphQL (`LINEAR_API_KEY`, `tracker.team_key`). Keys `#123`, `owner/repo#123` and `ENG-123` are recognized. `sdlc ci jira-merged` is now `sdlc ci tracker-merged` (the old name still works) and the templates pass `GH_TOKEN` and `LINEAR_API_KEY`. The `team-github` preset defaults to GitHub Issues. New setup guides `trackers/github.md` and `trackers/linear.md`, and a Trackers reference page.
- 856394a: Editor extension for VS Code and Cursor (`ai-sdlc-<version>.vsix` on each GitHub release): the next step in the status bar, a sidebar of changes by stage with "Waiting on my gate", and commands to approve or reject, open artifacts, start a quick change, open the dashboard and run `doctor --fix`. It bundles the CLI, so nothing has to be installed. `sdlc status --json` now includes `slug` and `title`, and prints nothing when there are no changes.

### Patch Changes

- a9ee75f: `sdlc next` no longer repeats the skill name in its message. New guide "Your first change in 10 minutes" (en/es) and `scripts/demo.sh`, a scripted demo of the loop on a throwaway repo.
- 2834612: Gate skills (`/sdlc-spec`, `/sdlc-plan`, `/sdlc-build`) state that only `status` counts: an `approved_by` value never turns a draft into an approved artifact. Found by the live eval `py-spec-refuses-draft-intent`.

## 0.3.0

### Minor Changes

- 6b20ab0: First public release: the `sdlc` CLI with adapters for Claude Code, Cursor and AGENTS.md, the local dashboard (`sdlc ui`), CI for GitHub, GitLab and Bitbucket (`sdlc ci`), Stage 6 control bands (`sdlc bands check`) and product evals.
- 5bbe966: `sdlc hosted`: read-only org board over a GitHub App installation (phase 1 of `docs/rfc/hosted.md`). Same stage rules as `sdlc status`, per-repo TTL cache dropped by push webhooks, optional viewer token.
- 5bbe966: `@claude` on GitLab and Bitbucket: `sdlc webhook` receives MR/PR comment webhooks and triggers the new `sdlc:mention` job / `sdlc-mention` custom pipeline, where `sdlc ci mention` answers the comment (read-only by default; `ci.mention_mode: edit` lets it commit within the approved plan).
