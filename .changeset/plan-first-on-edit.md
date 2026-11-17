---
'@morsadev/sdlc': minor
---

Plan before code is enforced from the agent's first edit, not only at push. On `change/*` branches, Claude Code and Cursor refuse edits to code until `plan.md` is approved, and the git `pre-commit` refuses the commit for every agent, including Codex and other AGENTS.md agents. The change's own files, docs and agent configuration can still change, and quick changes pass within `quick_lane`. The new `plan_first` setting (`edit`, the default, `commit` or `push`) starts the check later for teams that sketch code before planning. `/sdlc-plan` now says how to make each agent read-only while planning.
