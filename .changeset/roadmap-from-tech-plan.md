---
'@morsadev/sdlc': minor
---

From a technical plan to tickets. `/sdlc-roadmap` reads a technical plan (PDF, Markdown or a Google Doc), asks about what it leaves unclear and breaks it into epics and stories in `changes/_roadmaps/<slug>/roadmap.md`. A person approves it with `sdlc roadmap approve`, and `sdlc roadmap apply` creates the epics, the stories under them and the dependency links in Jira, GitHub Issues or Linear. It is idempotent, and a rerun after a failure continues where it stopped. Each story then enters the loop with `/sdlc-intent <KEY>`, and `sdlc next` suggests the first unblocked one.

- New commands: `sdlc roadmap new|check|approve|reject|apply|status|find|list`.
- `sdlc tracker create` accepts `--parent` and `--labels`; `sdlc tracker link BLOCKER BLOCKED` is new.
- Config: `tracker.epic_issue_type`, `tracker.epic_link_field` (Jira Data Center) and `gates.roadmap`.
- Dashboard: a Roadmaps view to upload a plan, answer the agent's questions, approve the breakdown and create the tickets.
