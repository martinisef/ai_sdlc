# The loop on one page (for teams)

Code is no longer the bottleneck. We move people to the **gates** and let each stage produce the artifact that triggers the next one.

## One change = one folder = one branch = one PR

```
changes/2026-10-claims-status/    branch: change/claims-status
  intent.md   spec.md   plan.md
```

## The steps

| # | Command | Who | Human gate |
|---|---|---|---|
| 1 | `/sdlc-intent [PROJ-123]` | whoever has the idea (PM, support, dev) | **PO** accepts: `sdlc approve <change> intent` |
| 2 | `/sdlc-spec`, or automatic in CI when the intent is accepted | the agent; the PO reviews | **PO** resolves the *areas of concern* with each owner, then approves |
| 3 | `/sdlc-plan` (in plan mode) | engineer + agent | **engineer** approves (tech lead if `risk: high`) |
| 4 | `/sdlc-build` | the agent implements; the engineer steers | none (tests green + verifier) |
| 4b | `/sdlc-fix` | for bugs: the failing test first | none |
| 5 | `/sdlc-ship [--babysit]` | the agent opens the PR/MR and looks after it | **code owner** approves the PR |
| 6 | `/sdlc-incident` | on-call + agent | **on-call** triages: fix now, schedule or dismiss |
| — | `/sdlc-status [--metrics]`, `sdlc ui` | anyone | — |

## Rules that make the loop work

- **Nothing is implemented without an approved plan.** Fixing a document is cheaper than redoing a diff.
- **If you deviate from the plan, update `plan.md` in the same commit.** The review compares the diff against the plan.
- **If the agent makes the same mistake twice, the correction goes into `CLAUDE.md`** (or `AGENTS.md`). If it keeps happening, it becomes an eval in `evals/`.
- **Hooks are not worked around.** When they block (protected path, secret, test during a fix, deploy to prod), the message says what the right path is.
- **The agent goes up to the production gate and does not cross it.** Approving and merging belong to a person.
- **Jira follows; it does not block.** If a transition fails, you get a warning and work continues.

## Parallel sessions

When the plan has independent steps, run one session per step in its own worktree (for example `claude --worktree <name>`). Start with 2 or 3; the ceiling is how much you can review well.

## New project

```bash
npx @morsadev/sdlc init     # then open your agent and run /sdlc-setup; follow SETUP.md
```
