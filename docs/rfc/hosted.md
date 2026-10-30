# RFC: hosted, multi-repo view

Status: **accepted for an MVP** (phase 1 implemented as `sdlc hosted`). Phases 2 and 3 are open.

## Problem

`sdlc ui` is local and per clone. It can switch between several local workspaces (`~/.config/sdlc/workspaces.json`), but it has no organization view. Product Owners and tech leads, who own the gates, often have no clone at all. They need a few things:

- every change across the organization's repositories, by stage;
- what is waiting for *their* gate;
- the same leading indicators that `sdlc metrics` computes, across teams.

## Principles

1. **Git stays the only source of truth.** Artifacts, statuses and gate decisions remain commits in each repository. The hosted service never holds state that cannot be rebuilt from git.
2. **Same core.** The board is computed with the same functions as the CLI (`parseFrontmatter`, `stageOf`, `canApprove`), so a change has the same stage everywhere.
3. **Least privilege.** The service only needs read access until phase 2. Gate decisions are written with the *person's* token, so the commit author is the approver and not a bot. Bot identities cannot approve anyway.
4. **Boring to operate.** One process, no database. A TTL cache over the API, invalidated by push webhooks.

## Phase 1 (MVP, implemented): read-only org view

- **A GitHub App** with `contents: read` and `metadata: read`, plus the `push` event, installed on the organization.
- **`sdlc hosted`** (Node ≥ 22; Docker or any host):
  - authenticates as the app with an RS256 JWT and then an installation token;
  - lists the installation's repositories;
  - reads `changes/*/{intent,spec,plan}.md` from the default branch and from every `change/*` branch through the Git Trees and Contents APIs.
- **Board.** Repositories × changes, with stage, statuses, the pending gate, risk and branch. It is exposed as `GET /api/org` (JSON) and `/` (a server-rendered page). A change on its `change/*` branch wins over the copy on the default branch, as in `listChanges`.
- **Cache.** Per repository, with a TTL of `SDLC_HOSTED_TTL` seconds (default 300). `POST /webhook` (push events, `X-Hub-Signature-256`) drops that repository's cache.
- **Access.** Not provided by the MVP. Run it behind the organization's SSO proxy (for example oauth2-proxy or Cloudflare Access), or set `SDLC_HOSTED_TOKEN` to require a bearer token or `?token=`. The service shows artifact titles and statuses, not file contents.

Configuration:

| Variable | |
|---|---|
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM, or `GITHUB_APP_PRIVATE_KEY_FILE`), `GITHUB_INSTALLATION_ID` | the GitHub App |
| `GITHUB_API` | default `https://api.github.com` (GitHub Enterprise: `https://<host>/api/v3`) |
| `SDLC_HOSTED_TOKEN` | optional viewer token |
| `SDLC_HOSTED_WEBHOOK_SECRET` | the app's webhook secret |
| `SDLC_HOSTED_TTL` | cache TTL in seconds |

## Phase 2: personal inbox and gates through the API

- **GitHub OAuth (user-to-server tokens) for sign-in.** The inbox shows the changes whose pending gate `canApprove` allows for the signed-in person, using `gates` and `roles` from each repository's `.sdlc/config.json`.
- **Approve or reject.** The service writes the same front-matter change that `decideGate` makes and commits it on the change branch with the **person's** token, through the Contents API (`PUT /repos/{o}/{r}/contents/{path}` with `branch`). The commit message keeps the `Gate: … by …` line.
- **Server side.** The service re-reads the artifact before writing (optimistic concurrency through the blob `sha`) and re-checks `canApprove`. It never caches tokens beyond the session.

## Phase 3

- Aggregated metrics (lead time and spec rework per team). This needs the activity log, which is local today: either commit a summary or derive everything from git history.
- GitLab and Bitbucket readers behind the same interface (`listRepos`, `readTree`, `readFile`, `commitFile`).
- Org-level settings: role templates and policy owners.

## Out of scope

- Editing `.sdlc/config.json` from the web; it stays a PR.
- Running agents. CI does that (`sdlc ci`), and the service never holds model credentials.
- Enterprise SSO built in; use a proxy.

## Alternatives considered

- **A database synced from webhooks.** Faster for large organizations, but it creates a second source of truth and needs migrations. Revisit above roughly 500 repositories.
- **Extending `sdlc ui` with remote workspaces.** Simpler, but every viewer would need a token with read access to every repository, and PO-style users would still have to run a CLI.
