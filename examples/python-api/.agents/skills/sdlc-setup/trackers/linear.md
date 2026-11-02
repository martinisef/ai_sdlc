# Tracker · Linear

Linear issues through its GraphQL API. Like every tracker, **it is not a gate**: if a call fails, the skills warn and continue.

## Setup questions
1. **Team key**: the prefix of the issue identifiers (`ENG` in `ENG-123`).
2. **Mode**: `linkage` (recommended), `jira-sot` (Linear is the source of truth: the intent goes into the issue description) or `repo-sot` (Linear only receives links). The mode name is shared by every tracker.
3. **Transitions**: list the team's workflow states (`sdlc tracker statuses`) and ask which one each stage maps to: `intent`, `spec`, `plan`, `ship`, `merged`. Unmapped stages: no transition.

## Block in sdlc.json
```json
"tracker": {
  "provider": "linear", "mode": "linkage", "team_key": "ENG",
  "transitions": { "spec": "In Design", "plan": "In Progress", "ship": "In Review", "merged": "Done" }
}
```

## Access
- **API key**: Linear → Settings → Security & access → Personal API keys (for CI, a key of a service member with access to the team). Export it as `LINEAR_API_KEY` locally; in CI, store it as a secret with that name (the templates pass it).
- Never store the key in the repo.
- **Interactive sessions**: if the team uses Linear's MCP server, the skills may use it; `sdlc tracker` is the fallback and what CI uses.

## Native integration (no code)
Linear's GitHub/GitLab integration links branches and PRs that contain the identifier (`change/ENG-123-…`) and can move the issue on its own. If you enable its automations, do not map the same stages in `transitions`, or both will move the issue.

## Verification
- `sdlc tracker get ENG-<n>` returns a test issue.
- `sdlc tracker statuses` lists every state used in `transitions`.
