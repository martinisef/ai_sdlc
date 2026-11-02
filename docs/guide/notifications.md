# Notifications

The loop waits on people: the PO accepts the intent, someone approves the spec and the plan, a code owner merges. `sdlc notify` posts each of those moments to the team's channel so nobody has to watch the PR.

| Event | Sent by | Says |
|---|---|---|
| `spec.ready` | `sdlc ci intent-to-spec`, after pushing the spec | the spec is written; who approves it |
| `gate.pending` | `sdlc ci gate-status`, when the push adds or changes the artifact a gate waits on | which artifact waits, and who has to decide |
| `gate.decided` | `sdlc ci gate`, after `/approve` or `/reject` in a comment | the decision, who made it, the reason |
| `review.done` | `sdlc ci review`, and `sdlc-review.yml` on GitHub | the review finished; the `Important: N · Nit: M` tally |
| `change.merged` | `sdlc ci jira-merged` (the merged-PR job) | the change is merged |

Each message carries the change, its stage, whoever has to act (from `gates` and `roles`), and links to the PR and to the artifact on the branch.

Notifications fail open: with no webhook nothing is sent, and a failed send is a log line in the CI job, never a failed build.

## Slack

1. In Slack, create an app (**api.slack.com/apps → Create New App → From scratch**), enable **Incoming Webhooks**, and **Add New Webhook to Workspace** for the channel.
2. Store the URL as a CI secret named `SDLC_NOTIFY_WEBHOOK` (GitHub: `gh secret set SDLC_NOTIFY_WEBHOOK`; GitLab: masked CI/CD variable; Bitbucket: secured repository variable). The templates from `sdlc ci install` already pass it.
3. Optionally, map people to Slack member IDs so the message mentions them (profile → ⋮ → **Copy member ID**):

```json
{
  "notify": {
    "format": "slack",
    "events": ["gate.pending", "gate.decided", "change.merged"],
    "people": { "@priya": "U012ABC", "dev@example.com": "U034DEF" }
  }
}
```

`people` keys are the same entries you use in `roles`: `@login`, email or git name. Without `format`, a `hooks.slack.com` URL is sent as Slack and anything else as generic.

## Teams, Discord and other webhooks

Set `"format": "generic"`. The body is JSON with `text` (Teams' incoming webhooks and most chat tools read it), `content` (Discord), and the structured fields for your own service:

```json
{
  "event": "gate.pending",
  "title": "add-login: the spec is waiting for approval",
  "text": "add-login: the spec is waiting for approval\nStage: spec-draft\nWho acts: @priya\nPR: https://github.com/acme/app/pull/12",
  "content": "…same as text…",
  "change": { "id": "changes/2026-10-add-login", "slug": "add-login", "stage": "spec-draft" },
  "artifact": "spec",
  "people": ["@priya"],
  "links": [{ "label": "PR", "url": "https://github.com/acme/app/pull/12" }]
}
```

## From a terminal or another pipeline

```bash
sdlc notify gate.pending --change add-login --artifact plan --dry-run   # print the payload
SDLC_NOTIFY_WEBHOOK=https://hooks.slack.com/services/… sdlc notify change.merged --change add-login
```

The change defaults to the one on the current branch (`HEAD_REF` in CI). Use `notify.webhook_env` to read the URL from a different variable, and `notify.events` to keep only the events the channel cares about.
