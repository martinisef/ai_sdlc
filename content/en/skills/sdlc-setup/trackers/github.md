# Tracker · GitHub Issues

Issues in the same repository as the code (or another one with `tracker.repo`). Like every tracker, **it is not a gate**: if a call fails, the skills warn and continue.

## How the loop maps onto issues
- **Stage = label.** Each stage gets a label, by default `sdlc:intent`, `sdlc:spec`, `sdlc:plan`, `sdlc:ship` and `sdlc:merged`. A transition removes the previous stage label and adds the new one.
- **`merged` closes the issue** (as completed), from `sdlc ci tracker-merged` when the PR merges.
- **Keys** are `#123`, or `owner/repo#123` for another repository. The squash suffix `(#45)` in a merge commit is the PR number and is ignored. Put the issue in the intent (`ticket: "#123"`) or in the branch (`change/issue-123-…`).

## Setup questions
1. Same repository as the code, or a separate one (`tracker.repo: "owner/repo"`)?
2. **Mode**: `linkage` (recommended: issue and repo linked), `jira-sot` (the issue is the source of truth: the intent goes into its body) or `repo-sot` (the issue only receives links).
3. Label names, if the team already has its own (`transitions`). GitHub creates a label the first time it is applied.
4. Label for new changes created by `/sdlc-intent` (`default_issue_type`, e.g. `enhancement`) and for incidents (`incident_issue_type`, e.g. `bug`).

## Block in sdlc.json
```json
"tracker": {
  "provider": "github", "mode": "linkage",
  "default_issue_type": "enhancement", "incident_issue_type": "bug",
  "transitions": { "spec": "sdlc:spec", "plan": "sdlc:plan", "ship": "in review", "merged": "sdlc:merged" }
}
```

## Access
- **Interactive sessions**: `gh auth login` is enough for the agent; `sdlc tracker` reads `GH_TOKEN` (or `GITHUB_TOKEN`), so export one locally (`export GH_TOKEN=$(gh auth token)`).
- **CI**: the `sdlc-loop.yml` merged job passes the workflow's `github.token` as `GH_TOKEN`, with `issues: write`. Nothing to create.
- GitHub Enterprise Server: set `GITHUB_API_URL` (Actions sets it already).

## Verification
- `sdlc tracker get "#<n>"` returns a test issue.
- `sdlc tracker transition "#<n>" spec` adds the spec label and removes the previous stage label.
