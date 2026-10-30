# CI

All CI logic is in one command, `sdlc ci <cmd>`. The per-provider templates are thin YAML that call `npx -y @ai-native-sdlc/cli@0 ci <cmd>` on Node 22. `/sdlc-setup` installs them for your provider; the files live in `content/en/skills/sdlc-setup/ci/`.

```text
sdlc ci bootstrap              install the agent CLI (and the Claude plugin when plugin.marketplace_repo is set)
sdlc ci review                 review the PR/MR with REVIEW.md and post the result as a comment
sdlc ci intent-to-spec         for accepted intents without spec.md: write the spec headless, commit, push
sdlc ci triage <log>           summarize a failed build and comment on the PR/MR
sdlc ci jira-merged            move the merged change's tickets to tracker.transitions.merged
sdlc ci evals [pattern] [--out results.json]   run evals/*.json against the agent; fail below ci.min_pass_rate (0.8)

Options: --agent claude|codex|cursor (or SDLC_CI_AGENT, or ci.agent) · --model M · --dry-run (print, do not post/push)
Env: ANTHROPIC_API_KEY | OPENAI_API_KEY | CURSOR_API_KEY · GH_TOKEN | GITLAB_TOKEN | BITBUCKET_ACCESS_TOKEN
     JIRA_EMAIL + JIRA_API_TOKEN (or JIRA_PAT) · SDLC_PLUGIN_REPO_URL / SDLC_PLUGIN_TOKEN (private marketplace)
```

## Headless agents

| `ci.agent` | CLI | Read-only (review, triage, diagnose) | Edit (intent-to-spec, evals) |
|---|---|---|---|
| `claude` (default) | `claude -p` | `--allowedTools` with read tools only | `--permission-mode acceptEdits` |
| `codex` | `codex exec` | `--sandbox read-only` | `--sandbox workspace-write` |
| `cursor` | `cursor-agent -p` | without `--force` | `--force` |

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

## Providers

What each template does and the manual setup it needs (secrets, permissions, branch protection):

- [GitHub](./ci-github)
- [GitLab](./ci-gitlab)
- [Bitbucket](./ci-bitbucket)
