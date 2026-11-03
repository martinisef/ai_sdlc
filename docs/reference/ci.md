# CI

All CI logic is in one command, `sdlc ci <cmd>`. The per-provider templates are thin YAML that call `npx -y @morsadev/sdlc@0 ci <cmd>` on Node 22. `sdlc init` installs them for the detected provider (or run `sdlc ci install` later); the files live in `content/en/skills/sdlc-setup/ci/`. The installer fills in the stack setup from `stacks/<lang>.md`, uses your `commands` when there is no Makefile, and never overwrites an existing file.

```text
sdlc ci install [--provider github|gitlab|bitbucket] [--preset solo|team-github|regulated]
                               copy the pipeline templates (stack setup filled in; never overwrites)
sdlc ci bootstrap              install the agent CLI (and the Claude plugin when plugin.marketplace_repo is set)
sdlc ci review                 review the PR/MR with REVIEW.md: one finder per pass, a verifier that votes, inline comments
                               and a summary; depth by risk tier (ci.review.depth), at most ci.review.max_rounds (3) rounds
sdlc ci security               the same, read-only, with security passes only (injection, access control, data and secrets)
sdlc ci review-status          set the sdlc/review commit status: failure while an Important or security finding is open
                               (closed when fixed, or by a maintainer's "resolved: <reason>" reply)
sdlc ci intent-to-spec         for accepted intents without spec.md: write the spec headless, commit, push
sdlc ci triage <log>           summarize a failed build and comment on the PR/MR
sdlc ci tracker-merged         move the merged change's tickets to tracker.transitions.merged (alias: jira-merged)
sdlc ci evals [pattern] [--out results.json]   run evals/*.json against the agent; fail below ci.min_pass_rate (0.8)
sdlc ci gate                   /approve|/reject intent|spec|plan in a PR/MR comment → gate commit on the branch + reply
sdlc ci gate-status            set the sdlc/gates commit status (success once the plan is approved or the change is quick)
sdlc ci risk [--escalate]      risk tier of the PR/MR from the diff (sticky comment, risk.json); --escalate (or
                               risk.agent_escalation) asks the agent whether it needs another person: it can only raise it
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

## Automated review

`sdlc ci review` reviews the PR/MR in three steps:

1. **Finders.** One read-only agent run per pass, in parallel. Each answers with findings as JSON: severity (`important`, `nit` or `pre_existing`), `file:line`, evidence and a bug class.
2. **Verifier.** Another run checks each candidate against the code and votes `keep` or `drop`; it drops what the code does not support and anything that is only style. At high risk three verifiers vote, and the majority decides.
3. **Comments.** Each Important finding and up to five nits on a line of the diff become inline comments. A sticky summary starts with the counts (`Important: 1 · Nit: 2 · Pre-existing: 0`, also in `review-tally.txt`) and lists every open finding; `review.json` has the details.

| Tier | Depth | Finders | Verifier votes |
|---|---|---|---|
| low | Quick | one, for every pass | 1 |
| medium | Standard | Bugs, Security, Compliance | 1 |
| high | Deep | the three plus Tests and Regressions | 3 |

`ci.review.depth` fixes the depth instead (`quick`, `standard`, `deep`; `auto` is the default).

**Convergence.** The summary keeps the state of the review (round, reviewed commit, findings). The next run reviews only the commits since then, tells the finders what was already reported so they do not repeat it, and asks the verifier whether the open findings were fixed. The same commit is never reviewed twice. After `ci.review.max_rounds` (3) rounds no finder runs; the verifier only rechecks the open findings. The state is read only from comments by a bot or a maintainer, so a contributor cannot fake it.

## Blocking review

`sdlc/review` is a commit status that both reviews set after each run, and `sdlc ci review-status` recomputes it:

- **failure** while an Important finding from `sdlc ci review`, or a security finding from `sdlc ci security` (any severity except pre-existing), is open;
- **pending** until the review of the latest commit has run;
- **success** otherwise. Nits and pre-existing findings never block.

A finding closes in one of two ways:

1. **Fixed.** The next round's verifier sees it is gone from the code.
2. **Resolved with a reason.** Someone replies `resolved: <reason>` to its inline comment, or writes `resolved f2 s1: <reason>` anywhere on the PR. On GitHub only owners, members and collaborators count; on GitLab and Bitbucket, the `risk.trusted_authors`. Agents and bots never count, and a reply without a reason is ignored.

On GitHub the `resolve` job in `sdlc-review.yml` runs on those replies; on GitLab and Bitbucket `sdlc webhook` triggers `review-status` (`SDLC_JOB=review-status`). `sdlc ci security` runs from `sdlc-security.yml` (GitHub), `sdlc:security` (GitLab) or the security step (Bitbucket). Make `sdlc/review` a required check.

## Gates from the PR

A comment whose line starts with `/approve <intent|spec|plan>` or `/reject <intent|spec|plan> [reason]` records the decision exactly like `sdlc approve`: a commit on the change branch with the commenter as author, checked against `gates` and `roles`. In `roles`, a GitHub/GitLab/Bitbucket user is written `@login`; emails and git names keep working for local approvals.

- **GitHub** (`sdlc-gates.yml`): only `OWNER`, `MEMBER` and `COLLABORATOR` comments count, and the PR author cannot decide spec or plan (unless `gates_self_approval`).
- **GitLab and Bitbucket**: `sdlc webhook` sees `/approve` and `/reject` and triggers the `sdlc:gate` job / `sdlc-gate` custom pipeline (`SDLC_JOB=gate`). Limit who can decide with `SDLC_ALLOWED_AUTHORS` and `roles`.

`sdlc ci gate-status` sets the **`sdlc/gates`** commit status: pending while intent, spec or plan wait, success once the plan is approved, for quick-lane changes, and for branches without a change folder; failure if the change was rejected. Make it a required check in branch protection so code cannot merge before its gates. The gate job refreshes it after each decision.

With `risk.profile: graded`, `sdlc/gates` also counts the PR's approvals against the tier of its diff (low 0, medium 1, high 2), drops approvals given before a commit nobody can vouch for, and counts the person directing the agent as one reviewer. The GitHub template re-runs it on `pull_request_review`. See [Risk tiers](../guide/risk#approvals-per-tier).

## Risk tier of the PR

`sdlc ci risk` classifies the PR/MR from its diff against the base (see [Risk tiers](../guide/risk)) and keeps one sticky comment, `## Risk (ai-sdlc)`, up to date with the tier and the reasons. It also writes `risk.json`. With `--escalate` or `risk.agent_escalation: true`, a second, read-only agent run answers "does this change need another person anyway?". It can raise the tier, never lower it; the escalation is recorded in the comment and the gates read it from there.

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
