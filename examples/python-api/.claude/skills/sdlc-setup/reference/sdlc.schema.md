# `.sdlc/config.json` — contract

It is read by the guardrails (`sdlc hook`, for any agent), the loop skills, the dashboard (`sdlc ui`) and CI (`sdlc ci`). JSON Schema: `sdlc schema`. Older projects with `.claude/sdlc.json` are still read (`sdlc migrate` moves it). All keys are optional except `version`; if the file is missing, the hooks do nothing.

```json
{
  "version": 1,
  "locale": "en",
  "agents": ["claude", "cursor", "agents-md"],
  "vcs": {
    "provider": "github | gitlab | bitbucket",
    "host": "github.com | gitlab.example.com | bitbucket.org",
    "workspace": "bitbucket only: workspace",
    "repo": "bitbucket only: repo slug",
    "default_branch": "main"
  },
  "tracker": {
    "provider": "jira | github | linear | none",
    "mode": "linkage | jira-sot | repo-sot",
    "base_url": "https://example.atlassian.net",
    "project_key": "PROJ",
    "default_issue_type": "Task",
    "incident_issue_type": "Bug",
    "transitions": {
      "intent": "To Do",
      "spec": "In Design",
      "plan": "In Progress",
      "ship": "In Review",
      "merged": "Done"
    }
  },
  "stack": { "language": "python", "package_manager": "uv", "project_type": "api" },
  "commands": {
    "build": "make build",
    "test": "make test",
    "lint": "make lint",
    "format": "make format",
    "run": "make run"
  },
  "format_on_edit": { "*.py": "uv run ruff format {file}" },
  "protected_paths": ["migrations/**", "src/gen/**", "infra/**"],
  "test_globs": ["tests/**", "**/*_test.py"],
  "secret_patterns_extra": [],
  "risk": {
    "high_risk_paths": ["src/auth/**", "infra/**"],
    "always_human_paths": [".github/workflows/**", ".sdlc/**", "REVIEW.md"],
    "profile": "strict",
    "tiers": { "low": { "approvals": 0 }, "medium": { "approvals": 1 }, "high": { "approvals": 2 } },
    "trusted_authors": ["@ana", "juan@example.com"],
    "size": { "low_max_lines": 50, "high_min_lines": 800 },
    "agent_escalation": false
  },
  "production_gate": { "patterns": ["deploy.*prod", "terraform apply"], "approval_env": "RELEASE_APPROVAL" },
  "gates": { "intent": ["po"], "spec": ["po", "policy-owners"], "plan": ["tech-lead"] },
  "roles": { "po": ["ana@example.com"], "tech-lead": ["juan@example.com"] },
  "plugin": { "marketplace_repo": "https://github.com/martinisef/ai_sdlc.git" },
  "ci": { "agent": "claude", "min_pass_rate": 0.8 }
}
```

| Key | Who uses it | Notes |
|---|---|---|
| `locale` | guardrail messages, dashboard | `en` or `es`. |
| `agents` | `sdlc sync`, `sdlc doctor` | Which adapters to generate: `claude`, `cursor`, `agents-md` (Codex, Copilot and others that read AGENTS.md). |
| `vcs.*` | `sdlc vcs`, `/sdlc-ship`, CI | If `provider` is missing, it is inferred from the remote. |
| `tracker.*` | `sdlc tracker`, loop skills, CI | `provider`: `jira`, `github` (GitHub Issues; `repo` if not the code's repository), `linear` (`team_key`) or `none`. `transitions` maps each stage to a Jira transition or target status, a GitHub label (default `sdlc:<stage>`; `merged` closes the issue) or a Linear workflow state. |
| `commands.*` | skills, `verifier`, evals | Each one is a single command that exits ≠ 0 on failure. |
| `format_on_edit` | PostToolUse hook | Glob → command; `{file}` is replaced with the path. Keep it fast (one file). |
| `protected_paths` | `protect-paths` hook | `*` crosses `/`; leading `**/` is optional. |
| `append_only_paths` | `protect-paths` hook, pre-commit | Same globs; new files are allowed, existing ones cannot change (e.g. applied migrations: `db/migrate/**`). |
| `test_globs` | `test-lock` hook | Files that cannot be edited during `/sdlc-fix`. |
| `secret_patterns_extra` | `secrets-guard` hook | Additional ERE regexes (e.g. format of sensitive internal IDs). |
| `risk.high_risk_paths` | `sdlc risk`, `/sdlc-spec`, `/sdlc-plan`, REVIEW.md | A change that touches them (or whose spec/plan names them) is **high** risk; a plan at high risk also needs a tech lead. |
| `risk.always_human_paths` | `sdlc risk` | Never low risk (at least **medium**). Default: CI workflows (`.github/workflows/**`, `.gitlab-ci.yml`, `ci/*.gitlab-ci.yml`, `bitbucket-pipelines.yml`), `.sdlc/**` and `REVIEW.md`. Setting the key replaces the list. |
| `risk.profile` | gates, `sdlc ci gate-status` | `strict` (default): every gate needs a person, as before. `graded`: human approvals scale with the tier (`risk.tiers`). Start strict; loosen with evidence (`sdlc metrics`). |
| `risk.tiers` | gates | Human approvals per tier. `graded` defaults: low 0, medium 1, high 2. The intent always needs a person. |
| `risk.trusted_authors` | gates | Who gets the lighter paths (git name, email or `@login`). Unset: everyone in `roles` (or anyone, when there are no roles). Others always need another person. |
| `risk.size` | `sdlc risk` | `low_max_lines` (default 50) and `high_min_lines` (default 800) of weighted code lines: modified and deleted lines count fully, lines in new files count half; docs and `test_globs` do not count. |
| `risk.agent_escalation` | `sdlc ci risk` | `true`: a second, agent classifier reads the diff and may raise the tier (never lower it). |
| `production_gate` | `production-gate` hook | ERE regexes over Bash commands; without the approval variable → block. |
| `gates` | `sdlc approve`, dashboard | Roles that can approve each artifact. No roles: any person (never an agent or bot). `risk: high` adds `tech-lead` to the plan. |
| `gates_self_approval` | `sdlc approve` | `true` (preset `solo`): the author may approve their own spec and plan. Agents and bots still cannot. |
| `roles` | `sdlc approve`, dashboard | Role → emails/git names, or `@login` on the forge (PR comments). |
| `quick_lane` | `sdlc quick`, pre-push hook | `enabled` (default `true`), `max_files` (code files, default 10), `forbid_paths` (globs, added to `risk.high_risk_paths`). Beyond them the push is blocked until `sdlc promote`. |
| `notify` | `sdlc notify`, `sdlc ci` | Loop events to Slack or a webhook. `webhook_env` (default `SDLC_NOTIFY_WEBHOOK`; unset → off), `format` `slack`\|`generic`, `events` (default all: `gate.pending`, `gate.decided`, `spec.ready`, `review.done`, `change.merged`), `people` (`@login`/email/name → Slack member ID, for mentions). Fail-open. |
| `plugin.marketplace_repo` | `sdlc ci bootstrap` | Where to clone the Claude plugin from in CI. Without it, CI uses the skills committed by `sdlc sync`. |
| `ci.agent` | `sdlc ci`, `sdlc bands check` | Headless agent in CI: `claude` (default), `codex` (`codex exec`) or `cursor` (`cursor-agent`). Overridden by `--agent` or `SDLC_CI_AGENT`. |
| `ci.model` | `sdlc ci` | Model passed to the agent CLI. |
| `ci.min_pass_rate` | `sdlc ci evals` | Minimum eval pass rate (default 0.8; `EVAL_MIN_PASS_RATE` overrides it). |
| `ci.pr_sections` | `sdlc ci gate-status`, `/sdlc-ship` | Headings every PR/MR description needs before `sdlc/gates` is green. Default `["Testing", "Risk", "How to revert"]` (Spanish headings count too); Risk must state at least the computed tier. `[]` turns the check off. |
| `ci.review.depth` | `sdlc ci review` | `auto` (default: low Quick, medium Standard, high Deep), or fixed: `quick`, `standard`, `deep`. |
| `ci.review.max_rounds` | `sdlc ci review` | Review rounds per PR (default 3). After the cap the reviewer only checks whether the open findings were fixed. |
| `ci.mention_mode` | `sdlc ci mention` | `read` (default): the agent only answers `@claude` comments. `edit`: it may also commit changes within the approved plan to the PR/MR branch. |
