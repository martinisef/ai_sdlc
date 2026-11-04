---
name: sdlc-roadmap
description: Stage 0 of the AI-native loop. Reads a technical plan (PDF, Markdown or a Google Doc), asks the person about what it leaves unclear and breaks it into epics and stories in changes/_roadmaps/<slug>/roadmap.md, ready for a person to approve and for `sdlc roadmap apply` to create the tickets. Use when someone brings a technical plan, a design document or an RFC and wants it turned into tickets, or says "plan the whole project from this doc".
argument-hint: "<path to the document | Google Doc URL | existing roadmap slug>"
---

# /sdlc-roadmap — from a technical plan to epics and stories

Goal: a breakdown people can approve in one read, where every story is one change of the loop. You draft and ask; a person approves; `sdlc roadmap apply` (plain code) creates the tickets. **You never create tickets yourself.**

Loop CLI: `sdlc` (if `sdlc` is not on the PATH: `node <this skill's base directory>/../../bin/sdlc.mjs`). Project config: `.sdlc/config.json`.

## 0. Input
- **A file** (`plan.pdf`, `design.md`): `sdlc roadmap new <slug> --source <file>` copies it into `changes/_roadmaps/<slug>/` and writes the template. Slug: short kebab-case from the plan's title.
- **A Google Doc URL**: read it with the Google Drive MCP if the session has it, and run `sdlc roadmap new <slug> --source <url>`. Without the MCP, ask for a PDF or Markdown export (File → Download) and use that file.
- **An existing slug** (`changes/_roadmaps/<slug>/roadmap.md` exists): continue that draft. Read it first; answered questions are decisions, keep them.
- Word files: ask for a PDF export.

## 1. Read the document
- Read the whole source (PDF: the Read tool reads it page by page). If it is long, go section by section and keep notes of: goals, scope and non-goals, components, data, integrations, constraints (security, PII, performance, deadlines), milestones and anything it says is undecided.
- If the repo has code, look at it to name the modules the plan touches, but do not design the solution: that is each story's spec and plan.

## 2. Draft the breakdown
Write `changes/_roadmaps/<slug>/roadmap.md`, keeping its frontmatter:

```markdown
# Roadmap: <plan title>

<two or three lines: the goal, what is in scope, what is not>

## E1 · <epic: a deliverable a user or another team can notice>

<one or two lines>

### E1.S1 · <story: one change, verb first>
- risk: low | medium | high
- depends: E1.S2, E2.S1        (or -)
- source: §<section of the document>
- labels: <optional, comma-separated>

<what and why, two or three lines>

Acceptance criteria:
- [ ] <observable behaviour, testable>

## Open questions
- Q1: <what the document leaves unclear and changes the breakdown>
  A:
```

Rules:
- **A story is one change**: one intent → spec → plan → PR. If it needs more than ~8 acceptance criteria or touches unrelated modules, split it.
- Ids are stable: `E<n>` for epics, `E<n>.S<m>` for their stories. Do not renumber after the person has seen them; add new ones at the end.
- `depends` only for real order (a table before the endpoint that uses it), not for "nice to have first".
- `risk` follows the project's tiers (`.sdlc/config.json → risk`): high for auth, payments, data migrations, `risk.high_risk_paths`.
- `source` points to the section of the document, so each story can be traced back.
- Do not write `key:` or `links:` lines: `sdlc roadmap apply` writes them.
- Put in **Open questions** only what changes the breakdown (scope, order, who owns what), not implementation details.

## 3. Ask
Ask the person the open questions **a few at a time** (one to three per turn, with AskUserQuestion when there are clear options). Write each answer on its `A:` line and update the epics and stories it affects. Repeat until there are no unanswered questions.

**Without a person** (the prompt says you are running headless, for example from the dashboard): do not ask. Write the draft and the questions, leave the `A:` lines empty and stop. When you are run again with answers filled in, apply them to the breakdown.

## 4. Check and commit
1. `sdlc roadmap check <slug>` must pass (exit 0). Fix every `✗`; read the `!` warnings and fix them unless there is a reason.
2. Show the person the outline (epics, stories, dependencies, risk) and adjust what they ask for.
3. Commit the folder: `git add changes/_roadmaps/<slug> && git commit -m "roadmap(<slug>): <title>"`.

## 5. Hand off
- **A person approves** with `sdlc roadmap approve <slug>` (or in the dashboard). Never approve it yourself, and never edit `status:`.
- After the approval: `sdlc roadmap apply <slug> --dry-run` shows what will be created; `sdlc roadmap apply <slug>` creates the epics, the stories under them and the "blocks" links in the tracker (Jira, GitHub Issues or Linear). The person runs it, or asks you to.
- Without a tracker (`tracker.provider: none`) the roadmap is the plan: each story starts with `/sdlc-intent "<story title>"`.

## Wrap-up
One line: the roadmap's path, how many epics and stories, open questions left, and **the next step**: "A person approves it → `sdlc roadmap approve <slug>`; then `sdlc roadmap apply <slug>`; each story starts with `/sdlc-intent <KEY>` (`sdlc next` says which)."
