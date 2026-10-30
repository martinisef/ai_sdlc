# Tracker · Jira

Jira accompanies the loop: **it is not a gate**. If a call fails, the skills warn and continue.

## Setup questions
1. Site **URL** (`https://<org>.atlassian.net` or Data Center) and **project key**.
2. **Mode** (playbook sidebar "Legacy systems and the source of truth"):
   | Mode | Source of truth | What the loop does |
   |---|---|---|
   | `linkage` (recommended to start) | both, linked | key in branch/folder/commits/PR; comments with path + SHA; transitions |
   | `jira-sot` | Jira | additionally: the intent is written into the ticket description, spec/plan summaries as a comment, ticket required |
   | `repo-sot` | the repo | Jira only receives links to the files; ticket optional |
3. **Transitions**: get the project's statuses (`sdlc tracker statuses`, or the Atlassian MCP) and ask for the mapping for each stage: `intent`, `spec`, `plan`, `ship`, `merged`. You can map to the transition name or to the target status. Unmapped stages: no transition.
4. **Issue types** for changes (`default_issue_type`, e.g. Story/Task) and incidents (`incident_issue_type`, e.g. Bug/Incident).

## Block in sdlc.json
```json
"tracker": {
  "provider": "jira", "mode": "linkage",
  "base_url": "https://<org>.atlassian.net", "project_key": "PROJ",
  "default_issue_type": "Task", "incident_issue_type": "Bug",
  "transitions": { "spec": "In Design", "plan": "In Progress", "ship": "In Review", "merged": "Done" }
}
```

## Access
- **Interactive sessions**: Atlassian remote MCP in the project's `.mcp.json` (each person authenticates with OAuth the first time with `/mcp`):
  ```json
  { "mcpServers": { "atlassian": { "type": "sse", "url": "https://mcp.atlassian.com/v1/sse" } } }
  ```
  Check the current URL and transport type in Atlassian's documentation when configuring it. The skills prefer the MCP; if it is not available, they use `sdlc tracker`.
- **CI and local fallback**: `sdlc tracker` with REST. Cloud: `JIRA_EMAIL` + `JIRA_API_TOKEN` (token of a service account with permission to transition and comment in the project). Data Center: `JIRA_PAT`.
- Never store tokens in the repo: they go as CI secrets or local environment variables.

## Native integration (no code)
Enable the Jira integration with the provider (GitHub for Jira / GitLab for Jira Cloud / native Bitbucket). With the key in the branch name and in commits/PR, Jira shows branches, commits and PRs on the ticket automatically.

## Verification
- `sdlc tracker get <test-KEY>` returns the ticket.
- `sdlc tracker transitions <test-KEY>` contains every mapped transition (or its target status).
