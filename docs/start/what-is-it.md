<script setup>
import { withBase } from 'vitepress'
</script>

# What it is, in 2 minutes

<video :src="withBase('/media/tutorial-en.mp4')" controls muted playsinline preload="metadata" style="width:100%;border-radius:8px">
  <track kind="subtitles" srclang="en" label="English" :src="withBase('/media/tutorial-en.vtt')" default />
</video>

*The whole tutorial in under four minutes. The agent's steps are sped up; everything else is the real tool.*

## The problem

An AI agent such as Claude Code or Cursor can write a feature in minutes. The hard part is no longer writing the code. It is making sure it builds **the right thing**, that **a person** agreed to it before any code exists, and that it **cannot** do something dangerous along the way, like pushing a password or editing a database migration.

Think of a building site. The builders (the agents) are very fast. You still want an architect to sign the drawings before the walls go up, and a fence around the hole in the ground. ai-native-sdlc is the signed drawings and the fence.

## How it works

Every change goes through the same short path. The agent writes each document; you read it and say yes or no with one command.

```text
 your idea
    │  the agent writes                       you decide
    ▼
 intent.md   the problem, in plain words  ──▶  sdlc approve … intent
    ▼
 spec.md     what will be built           ──▶  sdlc approve … spec
    ▼
 plan.md     how it will be built         ──▶  sdlc approve … plan
    ▼
 code + tests, then a pull request        ──▶  you review and merge
```

- Each document is a small Markdown file in `changes/<name>/`, committed to git, so there is always a record of who decided what.
- `sdlc next` always tells you the one thing to do now. You never have to remember where you are.
- Small things (a typo, a label) skip the documents through the **quick lane**.
- **Guardrails** stop the agent before it does something it should never do. They also apply to people, through git hooks.

## Words you will see

| Word | What it means |
|---|---|
| **Agent** | The AI that writes for you: Claude Code, Cursor, Codex or another that reads `AGENTS.md`. |
| **Change** | One piece of work, such as "mark a to-do as done". It lives in `changes/<date>-<name>/` and on the git branch `change/<name>`. |
| **Intent** | `intent.md`: the problem, in plain words. Why we want this. |
| **Spec** | `spec.md`: what will be built, as a list of requirements that can be checked. |
| **Plan** | `plan.md`: which files change, in what order, and how we know it works. |
| **Gate** | A point where a person must say yes (`sdlc approve`) or no (`sdlc reject`). An agent can never approve. |
| **Quick lane** | The short path for small changes: no spec and no plan, with limits checked on every push. |
| **Guardrail** | A rule that blocks an action before it happens: protected files, secrets, code before an approved plan. |
| **Preset** | A ready-made setup: `solo` (just you), `team-github` (a team on GitHub) or `regulated`. |
| **Skill** | A command for the agent, typed in its chat: `/sdlc-intent`, `/sdlc-plan`… |

## What you need

A computer with Node.js 22.18 or newer, git, and one AI agent. [Install](./install) walks you through each one.

Next: [Install](./install).
