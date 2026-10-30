# CI · Bitbucket Cloud

## Files installed by /sdlc-setup
| Template | Destination | What it does |
|---|---|---|
| `bitbucket/bitbucket-pipelines.yml` | `bitbucket-pipelines.yml` | PRs: build + review in parallel, triage if it fails · `change/**`: intent → spec · `main`: Jira to *merged* · custom: evals, control bands |

Every step runs `npx -y @morsadev/sdlc@0 ci <cmd>` on `node:22`: there is no CI script to copy.

If `bitbucket-pipelines.yml` already exists, merge the steps (`pull-requests`, `branches.change/**`, `custom.agent-evals`, `custom.control-bands`) without deleting what is already there.
Fill in the `# >>> stack` blocks (image and setup) from `stacks/<lang>.md` → "CI · Bitbucket".
Without Jira: remove the "Jira → merged" step. Without Stage 6: remove `custom.control-bands`.
In `.sdlc/config.json` fill in `vcs.workspace` and `vcs.repo` (the remote may not be available in every context).

## Differences from GitHub/GitLab
- **No official CLI**: `sdlc vcs` uses the REST API 2.0 (create PR, comment, read comments and statuses).
- **Review**: step with the headless agent (`claude -p`, or `ci.agent`) + comment via the API. No inline comments in the MVP: a single summary comment with `file:line`.
- **`@claude` in comments**: Pipelines are not triggered by comments, so a small service does it: `sdlc webhook` (one per workspace; see "@claude in comments" below) receives the "Pull request: Comment created" webhook and runs the `sdlc-mention` custom pipeline, which runs `sdlc ci mention`. Without the service, remove `sdlc-mention`.
- **Draft PRs**: supported by the API (`draft: true`); if the workspace does not support them, the intent PR is opened as a regular PR with "[intent]" in the title.

## Authentication
- In CI: **repository access token** (`BITBUCKET_ACCESS_TOKEN`) with *Pull requests: write* and *Repositories: write* permissions. Used as a Bearer token.
- Locally (for `/sdlc-ship`): the same kind of token, or `BITBUCKET_USER` (Atlassian email) + `BITBUCKET_API_TOKEN` (API token with Bitbucket scopes). App passwords are deprecated.

## Manual configuration (add to SETUP.md)
1. **Repository variables** (secured): `ANTHROPIC_API_KEY`, `BITBUCKET_ACCESS_TOKEN`, `SDLC_PLUGIN_TOKEN` if applicable, `JIRA_EMAIL` + `JIRA_API_TOKEN`.
2. **Branch restrictions** on `main`: no direct push, merge only via PR.
3. **Merge checks**: at least 1 approval, green builds. *Check in the workspace plan* which checks are enforced (on some plans they are only warnings).
4. **Default reviewers** / code owners for `CLAUDE.md`, `REVIEW.md`, `.claude/`, `evals/` (availability depends on the plan).
5. Nightly **schedule** for the `agent-evals` custom pipeline (and a daily one for `control-bands` with Stage 6).
6. **Jira ↔ Bitbucket** integration enabled on the Atlassian site (automatically links branches and PRs with the key).

## @claude in comments
1. Run the service where Bitbucket can reach it (HTTPS): `docker run -p 8787:8787 -e SDLC_WEBHOOK_SECRET=… -e BITBUCKET_ACCESS_TOKEN=… ghcr.io/martinisef/sdlc-webhook`, or `npx -y @morsadev/sdlc@0 webhook` on any Node ≥ 22 host.
2. Repository (or workspace) settings → Webhooks: URL `https://<host>/bitbucket`, Secret = `SDLC_WEBHOOK_SECRET`, trigger **Pull request: Comment created**.
3. Give the service a token that can run pipelines (`BITBUCKET_ACCESS_TOKEN`, repository or workspace access token with Pipelines write).
4. Optional: `SDLC_ALLOWED_AUTHORS=ana,juan` limits who can trigger the agent; `SDLC_MENTION=@agent` changes the mention.

The comment is untrusted input. By default the agent only answers (`ci.mention_mode: read`); with `edit` it may commit changes within the approved plan to the PR branch, and the guardrails still apply. Replies are marked so they never trigger the agent again.
