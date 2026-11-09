# From a technical plan to tickets

Optional, about 15 minutes plus the time to answer the agent's questions. When a whole project, or a large part of one, is already described in a technical plan (a PDF, a Google Doc, a Markdown file), the tool turns it into epics and stories in your tracker. Each story is then one change in the loop, from its intent to its pull request.

| Step | Who | What happens |
|---|---|---|
| 1. Hand the plan to the tool | you | `npx sdlc roadmap new` keeps a copy of the plan in the repo |
| 2. Draft the breakdown | the agent | `/sdlc-roadmap` reads the plan, asks about what it leaves unclear and writes `roadmap.md`: epics, stories, acceptance criteria and dependencies |
| 3. Approve | you | you read the breakdown, change what you want and approve it, the same as a spec |
| 4. Create the tickets | you | `npx sdlc roadmap apply` creates the epics, the stories under them and the links between them in Jira, GitHub Issues or Linear |
| 5. Work the stories | you and the agent | `npx sdlc next` says which story to start; each one goes through the loop with `/sdlc-intent <KEY>` |

The agent never creates tickets on its own: nothing reaches the tracker until a person approves the breakdown.

## What you need

- The project already set up ([Install](./install.md)) and the [tutorial](./tutorial.md) done once, so the loop is familiar.
- A tracker connected: [Jira](./jira.md), or GitHub Issues or Linear (see [Trackers](../reference/trackers.md)). Without one you can still draft and approve the breakdown, and start each story by its title.
- The plan as a file: PDF, Markdown or plain text, up to 20 MB. From Word, export it as PDF.
- Or the link to a Google Doc shared with **Anyone with the link** (Share → General access → Anyone with the link, Viewer). The tool downloads it as Markdown into `source.md` next to the roadmap, so the agent reads a local file. A private doc fails with `share it with "Anyone with the link"`; in that case share it that way, or download it (**File** → **Download** → **PDF**) and upload the file. The dashboard does not read other links (Notion, Confluence, a wiki): download the page and upload it.

The examples on this page use the to-do app from the tutorial and a Jira project with the key `PROJ`.

## Step 1: Hand the plan to the tool

Give the roadmap a short name (lowercase letters, digits and dashes) and point to the plan:

```bash
npx sdlc roadmap new todo-sharing --source ~/Downloads/plan.pdf
```

```text
created changes/_roadmaps/todo-sharing/roadmap.md (source: changes/_roadmaps/todo-sharing/source.pdf)
Next: /sdlc-roadmap todo-sharing in your agent: it reads the document, asks what is missing and drafts the epics and stories.
```

The copy of the plan lives next to the roadmap, so whoever reviews it later sees the same document you did.

## Step 2: Let the agent draft the breakdown

In the agent chat:

```text
/sdlc-roadmap todo-sharing
```

The agent reads the plan and asks one to three questions at a time, only about what changes the breakdown: scope, order, who owns what. Answer in the chat. When nothing is left open, it writes `changes/_roadmaps/todo-sharing/roadmap.md`. Below the header lines, it looks like this:

```markdown
# Roadmap: To-do sharing

Due dates for to-dos, and sharing a list with someone else as a file. Out of scope: accounts and syncing.

## E1 · Due dates

Each to-do can have a due date, and the overdue ones stand out.

### E1.S1 · Add a due date to a to-do
- risk: low
- depends: -
- source: §2.1

`add` accepts a date and `list` shows it.

Acceptance criteria:
- [ ] `add "Buy milk" --due 2026-12-01` saves the date
- [ ] `list` shows the date next to the to-do
- [ ] An invalid date is rejected with a message that says why

### E1.S2 · Mark overdue to-dos
- risk: low
- depends: E1.S1
- source: §2.2

Acceptance criteria:
- [ ] `list` puts `!` before the pending to-dos whose date has passed

## E2 · Sharing

A list travels as a JSON file; there is no server.

### E2.S1 · Export a list to a file
- risk: low
- depends: E1.S1
- source: §3.1

Acceptance criteria:
- [ ] `export list.json` writes every to-do with its state and date

### E2.S2 · Import a shared list
- risk: medium
- depends: E2.S1
- source: §3.2

Acceptance criteria:
- [ ] `import list.json` adds the to-dos that are not in the list yet
- [ ] A broken file changes nothing and the message says what is wrong

## Open questions
- Q1: When importing, is a to-do with the same text a duplicate?
  A: Yes, skip it.
```

| Part | What it means |
|---|---|
| `## E1 · …` | An epic: something a user or another team can notice. It becomes an epic in the tracker |
| `### E1.S1 · …` | A story: one change in the loop, small enough for one intent, spec and plan. It becomes a ticket under its epic |
| `risk` | `low`, `medium` or `high`. It carries over to the change's intent, and high-risk work gets the extra reviews of the loop |
| `depends` | Stories that must be merged first. They become "blocks" links in the tracker, and `sdlc next` does not suggest a blocked story |
| `source` | The section of the plan the story comes from, so the reviewer can check it |
| `Acceptance criteria` | What must be true when the story is done. The intent and the spec start from here |
| `Open questions` | What the plan leaves unclear, each with its answer (`A:`) |

It is a normal file: edit it in your editor, or ask the agent for changes ("merge E2.S1 and E2.S2", "E1.S2 is high risk").

## Step 3: Check and approve

Check that it is complete:

```bash
npx sdlc roadmap check todo-sharing
```

```text
✓ changes/_roadmaps/todo-sharing/roadmap.md: 2 epics, 4 stories, 0 open questions
```

The check fails when a question has no answer, a story has no acceptance criteria, or a dependency does not exist or goes in a circle. Fix what it says, or ask the agent to.

Then commit it, and approve it. As with the intent, spec and plan, a person approves, never the agent:

```bash
git add changes/_roadmaps && git commit -m "docs(roadmap): todo-sharing"
npx sdlc roadmap approve todo-sharing
```

```text
changes/_roadmaps/todo-sharing/roadmap.md approved by Ana Dev (0dc19da)
Next: sdlc roadmap apply todo-sharing creates 6 tickets (--dry-run shows them first).
```

To send it back instead, `npx sdlc roadmap reject todo-sharing -m "why"`. If you edit the roadmap after approving it, it needs a new approval before any ticket is created.

## Step 4: Create the tickets

First see what it would create, without touching the tracker:

```bash
npx sdlc roadmap apply todo-sharing --dry-run
```

```text
would create epic     E1 Due dates
would create story    E1.S1 Add a due date to a to-do
would create story    E1.S2 Mark overdue to-dos
would create epic     E2 Sharing
would create story    E2.S1 Export a list to a file
would create story    E2.S2 Import a shared list
would create link     E1.S1 blocks E1.S2
would create link     E1.S1 blocks E2.S1
would create link     E2.S1 blocks E2.S2
9 action(s); run without --dry-run to create them.
```

Then create them:

```bash
npx sdlc roadmap apply todo-sharing
```

```text
PROJ-2     epic     E1 Due dates
PROJ-3     story    E1.S1 Add a due date to a to-do
PROJ-4     story    E1.S2 Mark overdue to-dos
PROJ-5     epic     E2 Sharing
PROJ-6     story    E2.S1 Export a list to a file
PROJ-7     story    E2.S2 Import a shared list
PROJ-4     link     E1.S1 blocks E1.S2
PROJ-6     link     E1.S1 blocks E2.S1
PROJ-7     link     E2.S1 blocks E2.S2
6 tickets created, 3 links (keys saved in 1fd0d31)
Next: sdlc next suggests the first story to start (/sdlc-intent <KEY>).
```

Each ticket has the story's description, its acceptance criteria and a reference to the roadmap. The key of each one is written into `roadmap.md` (`- key: PROJ-3`) and committed, so running `apply` again creates nothing twice:

```text
nothing to do: every item has its ticket and every link exists
```

If the tracker fails halfway, the tickets already created are saved; run `apply` again and it continues from there.

## Step 5: Work the stories

Ask the tool what to do next:

```bash
npx sdlc next
```

```text
Next story of the roadmap todo-sharing: E1.S1 Add a due date to a to-do (PROJ-3) → /sdlc-intent PROJ-3
```

In the agent chat, start it like any ticket:

```text
/sdlc-intent PROJ-3
```

The agent reads the ticket and also the roadmap behind it: the section of the plan, the acceptance criteria and the answers to the open questions. From there, the loop is the same as in the [tutorial](./tutorial.md). To see the whole roadmap at any time:

```bash
npx sdlc roadmap status
```

```text
todo-sharing
  E1.S1   PROJ-3     ready                    Add a due date to a to-do
  E1.S2   PROJ-4     blocked by E1.S1         Mark overdue to-dos
  E2.S1   PROJ-6     blocked by E1.S1         Export a list to a file
  E2.S2   PROJ-7     blocked by E2.S1         Import a shared list
```

As each change moves through the loop, its line shows the stage, and the stories it was blocking become ready once it is merged.

## From the dashboard

The same steps work without the terminal. Open the dashboard (`npx sdlc ui`) and go to **Roadmaps**:

1. **New roadmap**: give it a name and upload the plan. The agent drafts the breakdown in the background (it needs Claude Code, Codex or the Cursor CLI installed).
2. When it has questions, they appear as a form. Answer them and press **Send answers**; the agent updates the breakdown.
3. Read the epics and stories, then **Approve** or **Reject**.
4. **Preview tickets** shows what would be created; **Create tickets** creates them.

## If something fails

| You see | What it means | Fix |
|---|---|---|
| `Q1 has no answer: …` | An open question has an empty `A:` | Answer it in the agent chat, or write the answer after `A:` |
| `the roadmap does not pass the check; fix it first:` | Approving needs a roadmap that passes `npx sdlc roadmap check` | Fix each line listed below that message |
| `… is draft; a person approves it first (sdlc roadmap approve todo-sharing)` | `apply` only runs on an approved roadmap | Do [step 3](#step-3-check-and-approve) |
| `… changed after it was approved; approve it again (sdlc roadmap approve todo-sharing)` | Someone edited the roadmap after it was approved | Review the change and approve it again |
| `looks like an agent or bot; a person must approve` | The approval was attempted with the agent's git identity | Approve from your own terminal |
| `tracker not configured (tracker.provider: jira \| github \| linear)` | There is no tracker connected | Connect one ([Jira](./jira.md)), or start each story by its title: `/sdlc-intent "Add a due date to a to-do"` |
| `unsupported source …` | The plan is not a PDF, Markdown or text file | Export it as PDF |
