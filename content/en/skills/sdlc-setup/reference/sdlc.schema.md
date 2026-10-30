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
    "provider": "jira | none",
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
  "risk": { "high_risk_paths": ["src/auth/**", "infra/**"] },
  "production_gate": { "patterns": ["deploy.*prod", "terraform apply"], "approval_env": "RELEASE_APPROVAL" },
  "gates": { "intent": ["po"], "spec": ["po", "policy-owners"], "plan": ["tech-lead"] },
  "roles": { "po": ["ana@example.com"], "tech-lead": ["juan@example.com"] },
  "plugin": { "marketplace_repo": "https://github.com/<org>/ai-native-sdlc.git" },
  "ci": { "agent": "claude", "min_pass_rate": 0.8 }
}
```

| Key | Who uses it | Notes |
|---|---|---|
| `locale` | guardrail messages, dashboard | `en` or `es`. |
| `agents` | `sdlc sync`, `sdlc doctor` | Which adapters to generate: `claude`, `cursor`, `agents-md` (Codex, Copilot and others that read AGENTS.md). |
| `vcs.*` | `sdlc vcs`, `/sdlc-ship`, CI | If `provider` is missing, it is inferred from the remote. |
| `tracker.*` | `sdlc tracker`, loop skills, CI | `transitions` accepts a transition name **or** a target status name. |
| `commands.*` | skills, `verifier`, evals | Each one is a single command that exits ≠ 0 on failure. |
| `format_on_edit` | PostToolUse hook | Glob → command; `{file}` is replaced with the path. Keep it fast (one file). |
| `protected_paths` | `protect-paths` hook | `*` crosses `/`; leading `**/` is optional. |
| `test_globs` | `test-lock` hook | Files that cannot be edited during `/sdlc-fix`. |
| `secret_patterns_extra` | `secrets-guard` hook | Additional ERE regexes (e.g. format of sensitive internal IDs). |
| `risk.high_risk_paths` | `/sdlc-spec`, `/sdlc-plan`, REVIEW.md | Marks `risk: high` → requires tech lead. |
| `production_gate` | `production-gate` hook | ERE regexes over Bash commands; without the approval variable → block. |
| `gates` | `sdlc approve`, dashboard | Roles that can approve each artifact. No roles: any person (never an agent or bot). `risk: high` adds `tech-lead` to the plan. |
| `roles` | `sdlc approve`, dashboard | Role → emails/git names. |
| `plugin.marketplace_repo` | `sdlc ci bootstrap` | Where to clone the Claude plugin from in CI. Without it, CI uses the skills committed by `sdlc sync`. |
| `ci.agent` | `sdlc ci`, `sdlc bands check` | Headless agent in CI: `claude` (default), `codex` (`codex exec`) or `cursor` (`cursor-agent`). Overridden by `--agent` or `SDLC_CI_AGENT`. |
| `ci.model` | `sdlc ci` | Model passed to the agent CLI. |
| `ci.min_pass_rate` | `sdlc ci evals` | Minimum eval pass rate (default 0.8; `EVAL_MIN_PASS_RATE` overrides it). |
| `ci.mention_mode` | `sdlc ci mention` | `read` (default): the agent only answers `@claude` comments. `edit`: it may also commit changes within the approved plan to the PR/MR branch. |
