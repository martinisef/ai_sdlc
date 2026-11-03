# Everyday use

A cheat sheet for your own project. Terminal commands start with `npx sdlc`; agent commands start with `/` and go in the agent's chat.

## The one command to remember

```bash
npx sdlc next
```

It looks at where every change is and tells you the one thing to do now: approve something, ask the agent for the next step, ship, or start a change.

## I want to…

| I want to… | I do… |
|---|---|
| Fix a typo, a label, a small thing | `npx sdlc quick "what"`, then `/sdlc-quick` |
| Build a feature | `npx sdlc new <short-name> --title "What"`, then `/sdlc-intent <the problem in my words>` |
| Start from a Jira ticket | `/sdlc-intent PROJ-123` |
| Know what is next | `npx sdlc next` |
| See all changes and their stage | `npx sdlc status`, or the Board in `npx sdlc ui` |
| Approve a document | `npx sdlc approve <change> intent` (or `spec`, `plan`) |
| Say no, with a reason | `npx sdlc reject <change> spec -m "R2 is not what we need"` |
| Have the agent write the next document | `/sdlc-spec`, then `/sdlc-plan` |
| Have the agent write the code | `/sdlc-build` (only after the plan is approved) |
| Open the pull request | `/sdlc-ship`; `/sdlc-ship --babysit` also follows the review and CI |
| Fix a bug | `/sdlc-fix <what is wrong>`: it writes a failing test first, then the fix |
| Handle something that broke in production | `/sdlc-incident <what happened>`: triage, a new intent, a lesson and an eval |
| Understand a module before touching it | `/sdlc-explain src/<module>`: writes `docs/explainers/<module>.md` |
| A small change grew too big | `npx sdlc promote`: moves it to the full loop |
| Check the setup | `npx sdlc doctor`; `npx sdlc doctor --fix` repairs what it can |
| Use the web dashboard | `npx sdlc ui` |
| See how the loop is going | `npx sdlc metrics --funnel` |

## A normal day

1. Open the terminal in your project and run `npx sdlc next`.
2. If it says "Your call": read the document it names (in `changes/…` or in the dashboard) and approve or reject it.
3. If it says "Next: /sdlc-…": type that in the agent chat.
4. Repeat until the pull request is open. Review and merge it as usual.

## Rules the tool enforces for you

- **No code before an approved plan.** Pushing code on a change branch without one is blocked.
- **Only people approve.** An agent, a bot, or (in a team) the author of the document cannot approve it.
- **Protected files stay protected.** Generated code and migrations are not edited from an agent session.
- **No secrets in code.** Writing something that looks like a password or API key is blocked.
- **During a bug fix, tests are locked.** The fix has to make the existing test pass, not change it.

When something is blocked, the message says why and what to do. See [Troubleshooting](./troubleshooting).

## Working in a team

Run `npx sdlc init --preset team-github` instead of `solo`. It asks who the Product Owner is (approves intent and spec) and who the tech lead is (approves the plan). Everything else stays the same. More in the [guide for teams](../guide/team).
