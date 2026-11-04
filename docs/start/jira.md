# Connect Jira

Optional, about 10 minutes. Once connected, each change in the loop is linked to its Jira ticket and the ticket moves on its own as the change moves:

| When… | Jira… |
|---|---|
| you start a change from a ticket (`/sdlc-intent PROJ-123`) | the agent reads the ticket and starts from its summary and description |
| the intent, spec or plan is written | gets a comment with the file path and the commit, and the ticket moves to the status you chose for that stage |
| the pull request is opened (`/sdlc-ship`) | gets the link to the pull request and moves to your "in review" status |
| the pull request is merged | moves to "Done" (when CI is set up, see [In CI](#in-ci)) |

Jira never blocks you. If a call fails (wrong token, Jira down, a status that does not exist), the tool shows a warning and the loop carries on.

Prefer to let the agent do it? Type `/sdlc-setup` in the agent chat and say you want to connect Jira; it asks the same questions as this page. Then come back to [step 4](#step-4-check-that-it-works) to check it.

## What you need

- The project already set up ([Install](./install.md)).
- Your Jira address, for example `https://your-company.atlassian.net`.
- The **project key**: the letters before the number in your tickets. In `PROJ-123` it is `PROJ`.
- Permission to comment on and move tickets in that project. If you can do it in the browser, you are fine.

## Step 1: Create an API token

The tool talks to Jira with a token, never with your password.

- **Jira Cloud** (the address ends in `atlassian.net`): open [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens), click **Create API token**, give it a name such as `ai-sdlc`, and copy it. Atlassian shows it only once.
- **Jira Data Center or Server** (your company hosts Jira): in Jira, click your avatar → **Profile** → **Personal Access Tokens** → **Create token**, and copy it.

## Step 2: Save it on your computer

The token goes in your computer's environment, **never in the project**: anything in the repo is visible to everyone with access to it.

Open your shell's settings file in an editor: `nano ~/.zshrc` on macOS, `nano ~/.bashrc` on Linux or Windows (WSL). Add these lines at the end, with your data:

```bash
# Jira Cloud
export JIRA_EMAIL="you@your-company.com"
export JIRA_API_TOKEN="paste-the-token-here"

# Jira Data Center or Server: this line instead of the two above
# export JIRA_PAT="paste-the-token-here"
```

Save (in nano: `Ctrl+O`, Enter, `Ctrl+X`), then close the terminal and open a new one so it picks up the change.

## Step 3: Tell the tool where your Jira is

Open `.sdlc/config.json` in your project. It has a `"tracker"` block that says `"provider": "none"`. Replace the whole block with this one, changing the address and the project key:

```json
"tracker": {
  "provider": "jira",
  "mode": "linkage",
  "base_url": "https://your-company.atlassian.net",
  "project_key": "PROJ",
  "default_issue_type": "Task",
  "incident_issue_type": "Bug",
  "transitions": { "spec": "In Design", "plan": "In Progress", "ship": "In Review", "merged": "Done" }
}
```

| Field | What to put |
|---|---|
| `base_url` | Your Jira address, without anything after `.net` (or after your server's name) |
| `project_key` | The letters of your tickets: `PROJ` for `PROJ-123` |
| `mode` | Leave `linkage`: the documents live in the repo and the ticket links to them. The other modes are in [Trackers](../reference/trackers.md) |
| `default_issue_type`, `incident_issue_type` | The ticket types used when the tool creates a ticket for a change or for an incident |
| `transitions` | Which Jira status each stage moves the ticket to (next section) |

The dashboard (`npx sdlc ui` → Settings → Tracker) also edits the provider, mode, address and project key. The transitions are edited in the file.

### Map the loop stages to your Jira statuses

Every Jira project names its statuses differently. Ask the tool for yours:

```bash
npx sdlc tracker statuses
```

```text
Done
In Design
In Progress
In Review
To Do
```

Then pick one for each stage: `spec` (the spec is written), `plan` (the plan is written), `ship` (the pull request is opened) and `merged`. A stage you leave out does not move the ticket. You can write the status name, as above, or the name of the transition button in Jira.

Save the file and commit it. It has no secrets:

```bash
git add .sdlc/config.json && git commit -m "chore: connect Jira"
```

## Step 4: Check that it works

Use any ticket from your project:

```bash
npx sdlc tracker get PROJ-1
```

```text
{"key":"PROJ-1","summary":"Mark a to-do as done","status":"To Do","type":"Story","description":null,"url":"https://your-company.atlassian.net/browse/PROJ-1"}
```

If you see the ticket's title, the connection works. To check the stage mapping, list where that ticket can move from its current status:

```bash
npx sdlc tracker transitions PROJ-1
```

```text
In Design	→ In Design
In Progress	→ In Progress
In Review	→ In Review
Done	→ Done
```

Each status you put in `transitions` should appear on the right. If you get an error instead, see [If something fails](#if-something-fails).

## Step 5: Use it

Start a change from a ticket by passing its key to the agent:

```text
/sdlc-intent PROJ-123
```

The agent reads the ticket, writes the intent from it, and names the folder and the branch with the key (`change/PROJ-123-…`). From there, the loop is the same as in the [tutorial](./tutorial.md): each step comments on the ticket and moves it. To move a ticket by hand, for example after merging without CI:

```bash
npx sdlc tracker transition PROJ-123 merged
```

```text
PROJ-123 → Done
```

Without a ticket, `/sdlc-intent` offers to create one.

## Optional: Jira inside the agent chat

With Claude Code, the agent can also read Jira directly through Atlassian's MCP server, which lets it search tickets and read comments. Create `.mcp.json` at the root of the project:

```json
{ "mcpServers": { "atlassian": { "type": "sse", "url": "https://mcp.atlassian.com/v1/sse" } } }
```

The first time, type `/mcp` in Claude Code and sign in with your Atlassian account. Each person signs in with their own account; there are no tokens in the file, so it can be committed. Check the current address in Atlassian's documentation. When the MCP is not available, the skills use `npx sdlc tracker` and the token from step 2.

## Optional: commits and pull requests on the ticket

Jira can show the branches, commits and pull requests of each ticket. That needs Jira's own integration with your git host: **GitHub for Jira**, **GitLab for Jira Cloud**, or Bitbucket (built in). Someone with admin access enables it once in Jira. The tool already puts the ticket key in the branch name, the commits and the pull request title, which is what that integration looks for.

## In CI

So that the ticket moves to "Done" when the pull request is merged, CI needs the same credentials. Add `JIRA_EMAIL` and `JIRA_API_TOKEN` (or `JIRA_PAT`) as secrets: in GitHub, Settings → Secrets and variables → Actions; in GitLab, Settings → CI/CD → Variables (masked); in Bitbucket, Repository variables (secured). Use a service account with permission to comment and move tickets, not your personal token. The CI pages for [GitHub](../reference/ci-github.md), [GitLab](../reference/ci-gitlab.md) and [Bitbucket](../reference/ci-bitbucket.md) have the rest.

## If something fails

| You see | What it means | Fix |
|---|---|---|
| `tracker not configured (tracker.provider: jira \| github \| linear)` | `.sdlc/config.json` still says `"provider": "none"` | Do [step 3](#step-3-tell-the-tool-where-your-jira-is) |
| `missing Jira credentials (JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT)` | The terminal does not see the token | Do [step 2](#step-2-save-it-on-your-computer) and open a new terminal. `echo $JIRA_EMAIL` should print your email |
| `HTTP 401` | Jira rejected the token | Check the email is the one of your Atlassian account and create a new token. On Data Center, use `JIRA_PAT` |
| `HTTP 404` | The ticket does not exist or you cannot see it | Check the key and that you can open the ticket in the browser |
| `transition 'In Design' is not available for PROJ-1 from its current status` | Your Jira workflow does not allow that move from where the ticket is now | Run `npx sdlc tracker transitions PROJ-1` and pick a status that appears there |
| `fetch failed` | The tool cannot reach Jira | Check `base_url`, and the VPN if your Jira is internal |
