# CI · GitLab

## Files installed by /sdlc-setup
| Template | Destination | What it does |
|---|---|---|
| `gitlab/gitlab-ci.yml` | `.gitlab-ci.yml` (only if it does not exist) | build + lint + test, triage if it fails on an MR |
| `gitlab/sdlc.gitlab-ci.yml` | `ci/sdlc.gitlab-ci.yml` | review with REVIEW.md, intent → spec, Jira on merge, evals, control bands (Stage 6) |

Every job runs `npx -y @ai-native-sdlc/cli@0 ci <cmd>` on `node:22`: there is no CI script to copy and no `jq` to install.

If `.gitlab-ci.yml` already exists: add `include: - local: ci/sdlc.gitlab-ci.yml` and the `review`, `loop`, `evals` stages. Do not replace it.
Fill in the `# >>> stack` block (image + setup) from `stacks/<lang>.md` → "CI · GitLab".
Without Jira: remove `sdlc:jira-merged`. Without Stage 6: remove `sdlc:bands`.

## Differences from GitHub
- **Review**: there is no equivalent of `claude-code-action`; the job runs the agent headless (`claude -p`, or `codex exec` / `cursor-agent` with `ci.agent`) and posts a comment on the MR via the API (`sdlc vcs` uses REST if `glab` is not available). Anthropic documents a Claude Code integration with GitLab CI/CD (beta): if the team adopts it, it can replace `sdlc:review`.
- **`@claude` in MR comments**: GitLab does not trigger pipelines from comments. It requires a "Comments" webhook to a service (Agent SDK) that launches a pipeline or handles the request. Left as an extension, outside the MVP.
- **Required Code Owners and approval rules**: depend on the tier (Premium/Ultimate). On Free: protected branch + "Allowed to merge: Maintainers" and review by convention.

## Manual configuration (add to SETUP.md)
1. **CI/CD variables**: `ANTHROPIC_API_KEY` (masked), `GITLAB_TOKEN` (project access token with `api` scope and Developer role: comments on MRs and pushes to `change/**`), `SDLC_PLUGIN_TOKEN` if the marketplace is private, `JIRA_EMAIL` + `JIRA_API_TOKEN` if there is Jira.
2. Default **protected branch**: no direct push, merge only via MR.
3. **Approval rules / CODEOWNERS** (Premium+): `CLAUDE.md`, `REVIEW.md`, `.claude/`, `evals/` with owners.
4. Nightly **pipeline schedule** (CI/CD → Schedules) for `sdlc:evals`; with Stage 6, a second daily schedule with the variable `SDLC_JOB=bands` for `sdlc:bands`.
5. Merge request settings: "Pipelines must succeed".
