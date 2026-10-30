# Tracker · none

The repo is the only source of truth: `changes/<YYYY-MM>-<slug>/` with intent, spec and plan.

```json
"tracker": { "provider": "none" }
```

- The skills do not try to call any tracker.
- Branches: `change/<slug>`. Folders with a date prefix.
- If Jira is added later: run `/sdlc-setup --only tracker`. Existing changes can be linked by filling in `ticket:` in their `intent.md`.
