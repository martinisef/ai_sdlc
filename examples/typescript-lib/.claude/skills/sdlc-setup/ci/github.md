# CI · GitHub

## Files installed by /sdlc-setup
| Template | Destination | What it does |
|---|---|---|
| `github/ci.yml` | `.github/workflows/ci.yml` | build + lint + test; if it fails on a PR, Claude triage posted as a PR comment |
| `github/sdlc-review.yml` | `.github/workflows/sdlc-review.yml` | review with REVIEW.md on every PR (`sdlc ci review`: finders, verifier, inline comments), `sdlc/review` commit status, `resolved: <reason>` replies + `@claude` in comments |
| `github/sdlc-security.yml` | `.github/workflows/sdlc-security.yml` | read-only security review on every PR (`sdlc ci security`); open security findings keep `sdlc/review` red |
| `github/sdlc-gates.yml` | `.github/workflows/sdlc-gates.yml` | `/approve spec`, `/reject plan …` in PR comments → gate commit; `sdlc/gates` commit status (make it required) |
| `github/sdlc-loop.yml` | `.github/workflows/sdlc-loop.yml` | accepted intent → automatic spec.md; merged PR → Jira to *merged* |
| `github/sdlc-evals.yml` | `.github/workflows/sdlc-evals.yml` | configuration evals on PRs that touch the agent configuration + nightly |
| `github/sdlc-nightly-review.yml` | `.github/workflows/sdlc-nightly-review.yml` | nightly review of existing code, one module per night (`sdlc ci nightly-review`): Important findings become intents on `change/review-*` with a draft PR; reverted commits become reviewer evals |
| `github/sdlc-bands.yml` | `.github/workflows/sdlc-bands.yml` | Stage 6 only: daily `sdlc bands check` over `ops/bands.yaml` |

Every workflow calls `npx -y @morsadev/sdlc@0 ci <cmd>` (Node 22 via `actions/setup-node`): there is no CI script to copy. Pin a version (`@0.2.0`) if the team prefers reproducible pipelines over updates.

If a `ci.yml` already exists, do not replace it: add the triage step to the existing job.
Fill in the `# >>> stack` blocks with the language setup (`stacks/<lang>.md` → "CI · GitHub").
The `tracker-merged` job moves the ticket (Jira, GitHub Issues or Linear) and sends `change.merged`; without a tracker or notifications it does nothing.
Without Stage 6 (no metrics with a stable baseline yet), do not install `sdlc-bands.yml`.
Other agents: with `ci.agent: codex|cursor`, pass `OPENAI_API_KEY` / `CURSOR_API_KEY` to the review and security jobs instead of `ANTHROPIC_API_KEY`. The `@claude` job still uses `claude-code-action`.

## Manual configuration (add to SETUP.md)
1. **Secrets** (Settings → Secrets and variables → Actions): `ANTHROPIC_API_KEY` (or configure Bedrock/Vertex/Foundry; `OPENAI_API_KEY` / `CURSOR_API_KEY` with `ci.agent` codex / cursor), `SDLC_PLUGIN_TOKEN` if the marketplace repo is private (token with read access to the repo), `JIRA_EMAIL` + `JIRA_API_TOKEN` if there is Jira, `LINEAR_API_KEY` with Linear, `SDLC_NOTIFY_WEBHOOK` for [notifications](https://martinisef.github.io/ai_sdlc/guide/notifications).
2. **Claude GitHub App** installed on the repo (used by `claude-code-action` for `@claude`; `/install-github-app` from Claude Code walks you through it). Alternative: the managed Code Review service, enabled by an admin.
3. **Branch protection** on the default branch: PR required, 1 code owner approval, `CI / build`, `sdlc/gates` and `sdlc/review` checks required, no direct push.
4. **CODEOWNERS**: at least `CLAUDE.md`, `REVIEW.md`, `.claude/**` and `evals/**` with owners (changes to the agent configuration are reviewed like code).
5. **Actions → General → Workflow permissions**: allow `GITHUB_TOKEN` to write (so that intent-to-spec can push the spec to the `change/**` branch and bands can push `change/incident-*`). For draft PRs from bands, also tick "Allow GitHub Actions to create and approve pull requests".

## Merge gate on findings
`sdlc/review` fails while an Important finding (or a security finding other than a pre-existing one) is open. A finding closes when the next round sees it fixed, or when someone with write access replies `resolved: <reason>` to its inline comment (`resolved f2: <reason>` in a PR comment also works); the `resolve` job recomputes the status. Require `sdlc/review` in branch protection so merges wait for it. Nits and pre-existing findings never block.
