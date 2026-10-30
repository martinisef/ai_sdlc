# CI · GitHub

## Files installed by /sdlc-setup
| Template | Destination | What it does |
|---|---|---|
| `github/ci.yml` | `.github/workflows/ci.yml` | build + lint + test; if it fails on a PR, Claude triage posted as a PR comment |
| `github/sdlc-review.yml` | `.github/workflows/sdlc-review.yml` | review with REVIEW.md on every PR (`claude-code-action`) + `@claude` in comments |
| `github/sdlc-loop.yml` | `.github/workflows/sdlc-loop.yml` | accepted intent → automatic spec.md; merged PR → Jira to *merged* |
| `github/sdlc-evals.yml` | `.github/workflows/sdlc-evals.yml` | configuration evals on PRs that touch the agent configuration + nightly |
| `github/sdlc-bands.yml` | `.github/workflows/sdlc-bands.yml` | Stage 6 only: daily `sdlc bands check` over `ops/bands.yaml` |

Every workflow calls `npx -y @morsadev/sdlc@0 ci <cmd>` (Node 22 via `actions/setup-node`): there is no CI script to copy. Pin a version (`@0.2.0`) if the team prefers reproducible pipelines over updates.

If a `ci.yml` already exists, do not replace it: add the triage step to the existing job.
Fill in the `# >>> stack` blocks with the language setup (`stacks/<lang>.md` → "CI · GitHub").
If the project does not use Jira, remove the `jira-merged` job.
Without Stage 6 (no metrics with a stable baseline yet), do not install `sdlc-bands.yml`.
Other agents: the review uses `claude-code-action` (inline comments); with `ci.agent: codex|cursor`, replace that job with `npx -y @morsadev/sdlc@0 ci review`, which posts a single summary comment.

## Manual configuration (add to SETUP.md)
1. **Secrets** (Settings → Secrets and variables → Actions): `ANTHROPIC_API_KEY` (or configure Bedrock/Vertex/Foundry; `OPENAI_API_KEY` / `CURSOR_API_KEY` with `ci.agent` codex / cursor), `SDLC_PLUGIN_TOKEN` if the marketplace repo is private (token with read access to the repo), `JIRA_EMAIL` + `JIRA_API_TOKEN` if there is Jira.
2. **Claude GitHub App** installed on the repo (used by `claude-code-action`; `/install-github-app` from Claude Code walks you through it). Alternative: the managed Code Review service, enabled by an admin.
3. **Branch protection** on the default branch: PR required, 1 code owner approval, `CI / build` checks required, no direct push.
4. **CODEOWNERS**: at least `CLAUDE.md`, `REVIEW.md`, `.claude/**` and `evals/**` with owners (changes to the agent configuration are reviewed like code).
5. **Actions → General → Workflow permissions**: allow `GITHUB_TOKEN` to write (so that intent-to-spec can push the spec to the `change/**` branch and bands can push `change/incident-*`). For draft PRs from bands, also tick "Allow GitHub Actions to create and approve pull requests".

## Merge gate on findings (optional)
The review publishes the line `Important: N · Nit: M`. A team that wants to block merges with Important > 0 can add a check that reads it; by default findings are informational only.
