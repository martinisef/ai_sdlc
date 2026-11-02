---
layout: home
hero:
  name: ai-native-sdlc
  text: Ship with AI agents, keep humans on the decisions
  tagline: One command sets up your repo. Agents write the intent, spec, plan and code; you approve each gate with one command; guardrails stop what should never happen. Claude Code, Cursor, Codex and any agent that reads AGENTS.md.
  actions:
    - theme: brand
      text: Your first change in 10 minutes
      link: /guide/first-change
    - theme: alt
      text: How the loop works
      link: /guide/concepts
features:
  - title: npx sdlc init, and you are done
    details: Presets for solo developers, GitHub teams and regulated teams. Agent files, git hooks and CI installed in one step; sdlc doctor --fix repairs the rest.
  - title: Always one next step
    details: sdlc next (and the dashboard, and the session context of your agent) says the one thing to do now. Small changes take the quick lane, with limits checked on every push.
  - title: One change, one folder, one branch
    details: changes/&lt;slug&gt;/intent.md → spec.md → plan.md on change/&lt;slug&gt;. Every stage ends by committing its artifact; the next stage reads it.
  - title: Human gates, recorded in git
    details: sdlc approve (or the dashboard) is a commit with the approver. Agents and bots cannot approve.
  - title: Guardrails that block
    details: Protected paths, secrets, test-lock during fixes and a production gate, enforced by agent hooks and by git hooks for every agent.
  - title: Local-first
    details: One CLI, a local dashboard (sdlc ui) and thin CI templates for GitHub, GitLab and Bitbucket. No service to run.
---
