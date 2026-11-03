# Your first change in 10 minutes

From an existing repository to a merged change, with the agent doing the writing and you making the decisions. You need Node ≥ 22.18, git, and one agent (Claude Code, Cursor, or Codex or another agent that reads AGENTS.md).

::: tip New to all this?
This page is the short version. [Start here](../start/what-is-it) explains every step, uses a tiny example app and has a three-minute video.
:::

## 1. Set up (1 minute)

```bash
cd your-repo
npm i -D @morsadev/sdlc
npx sdlc init --preset solo          # alone; for a team: --preset team-github
```

`init` detects the stack, the forge and your agents, asks at most three questions, installs the agent files, the git hooks and the CI templates, and ends with:

```text
✓ ai-sdlc ready · preset solo · python · agents: claude
  config   .sdlc/config.json (14 scaffold files, 61 agent files; --verbose lists them)
  gates    any person (never an agent)
  CI       1 file(s) for github; secret ANTHROPIC_API_KEY
Next: sdlc next (it always tells you what to do), or sdlc new <slug> to start a change.
```

Commit it: `git add -A && git commit -m "chore: ai-sdlc"`. If anything looks off, `npx sdlc doctor --fix` repairs what it can and tells you what it cannot.

## 2. A small change: the quick lane (4 minutes)

For a copy fix, a field or a small tweak, there is no need for a spec or a plan:

```bash
npx sdlc quick "Health endpoint returns the service name"
```

Then, in your agent: `/sdlc-quick`. It writes or updates the test, implements the change, runs your test and lint commands, and commits. Then `/sdlc-ship` opens the PR.

The quick lane has limits, checked on every push: at most 10 code files, and nothing under `risk.high_risk_paths` (auth, payments, migrations…). If the change grows past them, the push is blocked and `npx sdlc promote` moves it to the full loop. `npx sdlc quick --check` tells you where you stand.

## 3. A real change: the full loop (5 minutes of your time)

```bash
npx sdlc new export-claims --title "Export claims as CSV"
```

At any point, `npx sdlc next` says the one thing to do now. The full loop goes like this:

| `sdlc next` says | You do |
|---|---|
| Next: `/sdlc-intent` … | Describe the problem in your words; the agent writes `intent.md`. |
| Your call: the intent of export-claims → `sdlc approve export-claims intent` | Read it; approve or reject (`-m "why"`). |
| Next: `/sdlc-spec` … | The agent writes `spec.md` with acceptance criteria and *areas of concern*. |
| Your call: the spec → `sdlc approve export-claims spec` | Check the criteria; this is the contract. |
| Next: `/sdlc-plan` … | The agent proposes `plan.md`: files, order, tests, risks. |
| Your call: the plan → `sdlc approve export-claims plan` | Approve it; now code may be written (pre-push enforces it). |
| Next: `/sdlc-build` …, then `/sdlc-ship` | The agent implements step by step until tests pass, then opens the PR. |

Approvals are commits with your identity: agents and bots cannot approve, and in a team the PO approves intent and spec and the tech lead approves the plan. The dashboard (`npx sdlc ui`) shows the same next step at the top, an inbox of what waits for you, and a board of every change.

## 4. What you have now

- A merged change with its intent, spec and plan in `changes/`, linked to the PR.
- Guardrails that held while the agent worked: protected paths, secrets, the production gate, plan before code.
- `npx sdlc metrics --funnel`: how far changes get through the loop.

Next: [the loop in depth](./concepts), [guardrails](./guardrails), or [running a pilot with a team](./pilot).
