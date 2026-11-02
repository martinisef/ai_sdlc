# CI

All CI logic is in one command, `sdlc ci <cmd>`. The per-provider templates are thin YAML that call `npx -y @morsadev/sdlc@0 ci <cmd>` on Node 22. `sdlc init` installs them for the detected provider (or run `sdlc ci install` later); the files live in `content/en/skills/sdlc-setup/ci/`. The installer fills in the stack setup from `stacks/<lang>.md`, uses your `commands` when there is no Makefile, and never overwrites an existing file.

```text
sdlc ci install [--provider github|gitlab|bitbucket] [--preset solo|team-github|regulated]
                               copy the pipeline templates (stack setup filled in; never overwrites)
sdlc ci bootstrap              install the agent CLI (and the Claude plugin when plugin.marketplace_repo is set)
sdlc ci review                 review the PR/MR with REVIEW.md and post the result as a comment
sdlc ci intent-to-spec         for accepted intents without spec.md: write the spec headless, commit, push
sdlc ci triage <log>           summarize a failed build and comment on the PR/MR
sdlc ci tracker-merged         move the merged change's tickets to tracker.transitions.merged (alias: jira-merged)
sdlc ci evals [pattern] [--out results.json]   run evals/*.json against the agent; fail below ci.min_pass_rate (0.8)
sdlc ci gate                   /approve|/reject intent|spec|plan in a PR/MR comment → gate commit on the branch + reply
sdlc ci gate-status            set the sdlc/gates commit status (success once the plan is approved or the change is quick)
sdlc ci mention                answer an @claude comment on the PR/MR (triggered by `sdlc webhook`; ci.mention_mode read|edit)

Options: --agent claude|codex|cursor (or SDLC_CI_AGENT, or ci.agent) · --model M · --dry-run (print, do not post/push)
Env: ANTHROPIC_API_KEY | OPENAI_API_KEY | CURSOR_API_KEY · GH_TOKEN | GITLAB_TOKEN | BITBUCKET_ACCESS_TOKEN
     JIRA_EMAIL + JIRA_API_TOKEN (or JIRA_PAT) · SDLC_PLUGIN_REPO_URL / SDLC_PLUGIN_TOKEN (private marketplace)
```

## Headless agents

| `ci.agent` | CLI | Read-only (review, triage, diagnose) | Edit (intent-to-spec, evals) |
|---|---|---|---|
| `claude` (default) | `claude -p` | `--allowedTools` with read tools only | `--permission-mode acceptEdits` |
| `codex` | `codex exec` | `--sandbox read-only` | `--sandbox workspace-write` |
| `cursor` | `agent -p --trust` (or `cursor-agent`) | `--mode ask` | `--force` |

Claude Code is told to use "the sdlc-spec skill". The other agents are pointed at `.agents/skills/sdlc-spec/SKILL.md`. The guardrails apply in CI the same way they do locally.

## GitHub Action

The repository root is a composite action:

```yaml
- uses: martinisef/ai_sdlc@v0
  with:
    command: ci review          # any sdlc subcommand
    agent: claude               # optional
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GH_TOKEN: ${{ github.token }}
```

## Gates from the PR

A comment whose line starts with `/approve <intent|spec|plan>` or `/reject <intent|spec|plan> [reason]` records the decision exactly like `sdlc approve`: a commit on the change branch with the commenter as author, checked against `gates` and `roles`. In `roles`, a GitHub/GitLab/Bitbucket user is written `@login`; emails and git names keep working for local approvals.

- **GitHub** (`sdlc-gates.yml`): only `OWNER`, `MEMBER` and `COLLABORATOR` comments count, and the PR author cannot decide spec or plan (unless `gates_self_approval`).
- **GitLab and Bitbucket**: `sdlc webhook` sees `/approve` and `/reject` and triggers the `sdlc:gate` job / `sdlc-gate` custom pipeline (`SDLC_JOB=gate`). Limit who can decide with `SDLC_ALLOWED_AUTHORS` and `roles`.

`sdlc ci gate-status` sets the **`sdlc/gates`** commit status: pending while intent, spec or plan wait, success once the plan is approved, for quick-lane changes, and for branches without a change folder; failure if the change was rejected. Make it a required check in branch protection so code cannot merge before its gates. The gate job refreshes it after each decision.

## `@claude` on GitLab and Bitbucket

GitHub runs `@claude` through `claude-code-action` in `sdlc-review.yml`. GitLab and Bitbucket do not start pipelines from comments, so `sdlc webhook` bridges them:

```text
MR/PR comment "@claude …" ──webhook──▶ sdlc webhook ──trigger API──▶ sdlc:mention (GitLab) / sdlc-mention (Bitbucket)
        ▲                                                                   │
        └──────────── reply (and, in edit mode, a push) ◀── sdlc ci mention ┘
```

The service validates the GitLab secret token or the Bitbucket HMAC signature, ignores bots, its own replies and authors outside `SDLC_ALLOWED_AUTHORS`, and triggers the pipeline with `PR_NUMBER`, `BASE_REF`, `HEAD_REF`, `SDLC_MENTION_AUTHOR` and `SDLC_MENTION_BODY`. It holds no model credentials and no state.

```bash
docker run -p 8787:8787 -e SDLC_WEBHOOK_SECRET=… -e GITLAB_TRIGGER_TOKEN=… ghcr.io/martinisef/sdlc-webhook
# or: npx -y @morsadev/sdlc@0 webhook --port 8787      (POST /gitlab, POST /bitbucket, GET /health)
```

| Variable | |
|---|---|
| `SDLC_WEBHOOK_SECRET` | required; GitLab "Secret token" / Bitbucket webhook "Secret" |
| `GITLAB_TRIGGER_TOKEN`, `GITLAB_API` | GitLab: pipeline trigger token; API base (default: the project's host + `/api/v4`) |
| `BITBUCKET_ACCESS_TOKEN`, `BITBUCKET_API` | Bitbucket: token with Pipelines write |
| `SDLC_ALLOWED_AUTHORS`, `SDLC_MENTION` | who may trigger (default anyone who can comment); the mention (default `@claude`) |

The comment is untrusted input: by default the agent only answers (`ci.mention_mode: read`). With `edit` it may commit within the approved plan, and the guardrails still apply. Setup per provider: [GitLab](./ci-gitlab#claude-in-comments), [Bitbucket](./ci-bitbucket#claude-in-comments).

## Providers

What each template does and the manual setup it needs (secrets, permissions, branch protection):

- [GitHub](./ci-github)
- [GitLab](./ci-gitlab)
- [Bitbucket](./ci-bitbucket)
