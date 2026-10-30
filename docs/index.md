---
layout: home
hero:
  name: ai-native-sdlc
  text: The AI-native SDLC loop, in your repo
  tagline: Intent → spec → plan → build → ship → incident. Agents produce each artifact; people own the gates. Works with Claude Code, Cursor and any agent that reads AGENTS.md.
  actions:
    - theme: brand
      text: Get started
      link: /guide/introduction
    - theme: alt
      text: Quickstart (Claude Code)
      link: /guide/quickstart-claude
features:
  - title: One change, one folder, one branch
    details: changes/&lt;slug&gt;/intent.md → spec.md → plan.md on change/&lt;slug&gt;. Every stage ends by committing its artifact; the next stage reads it.
  - title: Human gates, recorded in git
    details: sdlc approve (or the dashboard) is a commit with the approver. Agents and bots cannot approve.
  - title: Guardrails that block
    details: Protected paths, secrets, test-lock during fixes and a production gate, enforced by agent hooks and by git hooks for every agent.
  - title: Local-first
    details: One CLI, a local dashboard (sdlc ui) and thin CI templates for GitHub, GitLab and Bitbucket. No service to run.
---
