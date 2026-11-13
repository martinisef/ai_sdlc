# From meetings to project state

*Experimental.* Optional, a few minutes per meeting. When the project is shaped in meetings with the client (kickoffs, weekly syncs, reviews), the tool keeps what was asked, agreed and left open in the repo, with a quote from the meeting behind every line. Before each new feature is written down, the agent checks it against the tracker, the code on the main branch and the branches in flight, so nobody plans twice what already exists.

| Step | Who | What happens |
|---|---|---|
| 1. Register the meeting | you | `npx sdlc discovery add` copies the transcript into the repo and refuses one already processed |
| 2. Merge it | the agent | `/sdlc-discovery` reads the transcript and updates the topics: features, action items, decisions, questions and risks |
| 3. Review and commit | you | `STATUS.md` says what is to do, what is still open and who owes what; you read the diff and commit it |
| 4. Follow up | you | `npx sdlc discovery followup` drafts the message to the client with the open questions |
| 5. Plan the work | you and the agent | `npx sdlc roadmap new --from-discovery` turns the requested features into a roadmap, which becomes tickets as in [From a technical plan to tickets](./roadmap.md) |

The agent never writes to the tracker here, never sends anything to the client and never changes branches: it only reads them.

## What you need

- The project already set up ([Install](./install.md)).
- The transcript of each meeting as a file: the PDF or text that Meet, Zoom or Teams export, a `.vtt` or `.srt` subtitle file, or your minutes in Markdown. If the file name has a date (`weekly-2026-09-14.vtt`), that is the meeting date; otherwise pass `--date`.
- Optional: a tracker connected ([Jira](./jira.md), GitHub Issues or Linear). Without one, tickets are recorded as `not verified`.

The examples on this page use a fictitious client, Contoso, and the money library in `examples/typescript-lib`.

## Where it lives

Everything is in `changes/_discovery/`, committed like the rest of the project:

| Path | What it is |
|---|---|
| `_sources.md` | One row per meeting processed: date, name, type, file and SHA-256. Evidence cites these labels (`2026-09-01 Kickoff`) |
| `transcripts/` | The copies of the transcripts. With `discovery.commit_transcripts: false` they stay out of git, and only their name and hash are committed |
| `topics/<topic>.md` | One file per area the meetings keep coming back to (billing, onboarding, currencies), with five tables and a history of changes |
| `STATUS.md` | The summary, written by `sdlc discovery status`. Do not edit it |
| `followups/` | The follow-up drafts you chose to keep |

A topic looks like this:

```markdown
## Features
| ID | Feature | Status | Repo | Ticket | Blocked by | Evidence |
|---|---|---|---|---|---|---|
| F1 | Instalments with allocate: the leftover cent follows Contoso's accounting rule | requested | partial | no ticket | Q1 | 2026-09-01 Kickoff · Paula: "the leftover cent must follow their accounting rule" |
| F2 | Support the Brazilian real (BRL) | requested | missing | no ticket | | 2026-09-01 Kickoff · Iván: "the library must support the Brazilian real" |

## Questions
| ID | Question | To | Status | Since | Answer | Evidence |
|---|---|---|---|---|---|---|
| Q1 | Which share gets the leftover cent when an amount does not split evenly? | Client: Paula | open | 2026-09-01 | | 2026-09-01 Kickoff · Paula: "finance will tell" |

## Changes
- 2026-09-01 Kickoff: F1, F2, A1, Q1 added
```

| Column | What it means |
|---|---|
| `Status` | A closed list: `requested`, `in progress`, `done`, `reimplement`, `out of scope`, `dropped`. Spanish names are accepted too |
| `Repo` | What the main branch has today: `missing`, `partial`, `exists` or `not verified` |
| `Ticket` | A confirmed key (`PROJ-12`), a likely one not yet confirmed (`~PROJ-12`), `no ticket` or `not verified` |
| `Blocked by` | Open questions the feature waits on, in this topic (`Q1`) or another (`billing#Q2`) |
| `Evidence` | `<meeting> · [time ·] speaker: "quote"`, so anyone can go back to what was said |

Rows are never deleted: a feature the client no longer wants becomes `dropped`, and an answered question keeps its question. `sdlc discovery validate` enforces it against the last commit.

## Step 1: Register the meeting

```bash
npx sdlc discovery add ~/Downloads/kickoff-2026-09-01.md --name Kickoff
```

```text
added '2026-09-01 Kickoff' → changes/_discovery/transcripts/2026-09-01-kickoff.md
Next: /sdlc-discovery in your agent merges it into the topics (evidence cites "2026-09-01 Kickoff").
```

The same file twice, even with another name, does nothing:

```text
✗ already processed as '2026-09-01 Kickoff': nothing to do
```

A meeting older than the last one processed is refused too, because the topics already reflect what came after it. If it really is missing, add it with `--force`. `--type` says what kind of meeting it was (`client`, the default, `review`, `daily`, `internal` or `other`).

## Step 2: Let the agent merge it

In the agent chat:

```text
/sdlc-discovery
```

The agent reads only the new transcript and the topics it touches, and for each feature it adds or reopens:

- searches the tracker (`npx sdlc tracker search`), open and closed issues. A closed issue that already solved it makes the feature `done`, unless the client asks for it again: then it is `reimplement`, with the reason in the evidence.
- searches the code on the main branch with `git grep` (it never checks out another branch) to fill in `Repo`.
- lists the branches not merged yet (`npx sdlc discovery branches`), and reports one that works on the same thing.

It ends with at most ten lines: what changed, conflicts with earlier meetings or with work in flight, and the questions for the client.

## Step 3: Review and commit

```bash
npx sdlc discovery validate
npx sdlc discovery status
```

```text
✓ 1 topics, 4 rows, 1 sources
wrote changes/_discovery/STATUS.md: 2 to do, 1 open question, 1 open action item
```

`STATUS.md` is the page to read before the next meeting:

```markdown
## To do

### Currencies and amounts (`currencies`)
- currencies#F1 [requested · partial] Instalments with allocate: the leftover cent follows Contoso's accounting rule — blocked by Q1
- currencies#F2 [requested · missing] Support the Brazilian real (BRL)

## Open questions (oldest first)

- 2026-09-01 · currencies#Q1 Which share gets the leftover cent when an amount does not split evenly? → Client: Paula
```

Read the diff like any other change, fix what the agent misunderstood, and commit the folder:

```bash
git add changes/_discovery && git commit -m "docs(discovery): 2026-09-01 Kickoff"
```

To find what was said about something across every meeting: `npx sdlc discovery search leftover cent`.

## Step 4: Follow up with the client

```bash
npx sdlc discovery followup
```

```markdown
# Follow-up — 2026-09-01 Kickoff

## For Client: Paula

**New questions**

1. Which share gets the leftover cent when an amount does not split evenly? (currencies#Q1)
```

The questions raised in the last meeting come first, then the ones still pending from before, with the date they were first asked. `--write` keeps the draft in `followups/`. Polish it and send it yourself; `discovery.followup_locale` sets its language.

## Step 5: Turn it into a roadmap

```bash
npx sdlc roadmap new currencies --from-discovery currencies --title "Currencies"
```

```text
created changes/_roadmaps/currencies/roadmap.md: 1 epic, 1 story from changes/_discovery; 1 open question for the blocked currencies#F1
Next: /sdlc-roadmap currencies in your agent completes the acceptance criteria, risk and dependencies.
```

Each requested feature without a ticket becomes a story with its quotes and `source: currencies#F2`; each blocked one becomes an open question of the roadmap, which cannot be approved until it is answered. Without topic names, every topic goes in. From there it is the same as [From a technical plan to tickets](./roadmap.md#step-2-let-the-agent-draft-the-breakdown).

## A project already under way

When the project started before the tool, write a baseline first, so the first meeting is compared with what already exists:

```bash
npx sdlc discovery seed --dry-run
npx sdlc discovery seed
```

```text
wrote changes/_discovery/topics/_baseline.md: 1 added, 0 updated, 0 unchanged (from 0 tickets, 0 changes, 0 roadmap stories, 1 branch)
Next: sdlc discovery status, then commit the discovery folder.
```

It reads the tracker's issues (up to `--limit`, newest first), the changes in `changes/`, the roadmap stories and the unmerged branches, and writes one feature per item with `seed · …` as evidence. Running it again refreshes those rows and keeps what a person changed by hand (`reimplement`, `out of scope`, a reason).

## Settings

In `.sdlc/config.json`, all optional:

```json
{
  "discovery": {
    "base_branch": "main",
    "team": ["Ada", "sam@northwind.dev"],
    "followup_locale": "en",
    "commit_transcripts": true
  }
}
```

`team` is who counts as your side (`Team: …`) in action items and questions; without it, everyone in `roles`. `base_branch` defaults to `vcs.default_branch`. See [Configuration](../reference/config.md).

## From the dashboard

Open the dashboard (`npx sdlc ui`) and go to **Discovery**. **Add a meeting**: upload the transcript, give it a name and press **Upload and process**; the agent starts in the background (it needs Claude Code, Codex or the Cursor CLI installed); when it finishes, the page shows what is to do by topic, the open questions, the action items, the risks and the follow-up draft. **Seed from the tracker and git** writes the baseline.

## If something fails

| You see | What it means | Fix |
|---|---|---|
| `meeting date unknown: pass --date YYYY-MM-DD` | The file name has no date | Add `--date 2026-09-14` |
| `already processed as '…': nothing to do` | That file, or a meeting with the same date and name, is in `_sources.md` | Nothing to do; it is already merged |
| `… is older than the last source (…): --force adds it anyway` | A later meeting was processed already | Add `--force` if it really is missing; the agent marks what the newer meetings changed |
| `F1 cites '…', which is not in _sources.md (or 'seed')` | A row quotes a meeting that was never registered | Register it with `sdlc discovery add`, or fix the label |
| `F2 was deleted (rows are never deleted: change its status)` | A row that is in the last commit is gone (also a topic, a source or a Changes line) | Restore it and change its status (`dropped`, `answered`…) |
| `STATUS.md is out of date: run sdlc discovery status` | A topic changed after the last `status` | Run `npx sdlc discovery status` |
