---
name: sdlc-discovery
description: Discovery stage of the AI-native loop (experimental). Reads a meeting transcript or minutes (PDF, Markdown, text, VTT, SRT) and merges what was asked, agreed, decided, asked back and feared into the project state in changes/_discovery/ (topics, STATUS.md, a follow-up draft), checking each request against the tracker, the code and the branches in flight. Use when someone brings a meeting transcript, says "process this meeting", "update the project state from this call", or wants to know what the client asked so far.
argument-hint: "<transcript file> [meeting name] | seed | status"
---

# /sdlc-discovery — from meetings to project state

Goal: after every meeting, the project state says what the client wants, what is already built or in flight, what is still unanswered and who owes what, with the quote that proves each line. You extract and merge; plain code (`sdlc discovery`) checks the format and writes STATUS.md. **You never write to the tracker**: no tickets, comments or transitions, neither through `sdlc tracker` nor through an MCP.

Loop CLI: `sdlc` (if `sdlc` is not on the PATH: `node <this skill's base directory>/../../bin/sdlc.mjs`). Project config: `.sdlc/config.json`. Discovery folder: `changes/_discovery/` (or `discovery.dir`), called `<dir>` below:
- `topics/<topic>.md`: one per area, five tables (features, action items, decisions, questions, risks) and a Changes log. The format and the closed lists of statuses are in `templates/topic.md` next to this skill: read it once.
- `_sources.md`: the meetings already processed. `STATUS.md`: generated, never edited by hand. `followups/`: drafts for the client. `transcripts/`: the files.

Cost rule: read `STATUS.md`, the **new** transcript and only the topics you will touch. Never re-read old transcripts; to find an earlier request use `sdlc discovery search <words>` instead of opening every topic.

## 0. Input
- **A transcript** (pdf, md, txt, vtt, srt; Word or Google Docs: ask for a PDF or text export). Several: process them one at a time, oldest first.
- **`seed`**, or a first run on a project that already has code, tickets or changes (no `<dir>/topics/` yet): run `sdlc discovery seed` first. It writes `topics/_baseline.md` with one row per tracker issue (open or closed), change, roadmap story and unmerged branch, so nothing already built is requested again. Commit it on its own, then go on.
- **`status`** or no argument: run `sdlc discovery status` and summarise STATUS.md. Stop there.

## 1. Register the source
1. Name the meeting as people call it ("Weekly sync", "Kickoff"). The date comes from the file name, or pass `--date YYYY-MM-DD` (from the transcript header, or ask).
2. `sdlc discovery add <file> --name "<name>" --check`:
   - `already processed as '…'` → stop and say so: the meeting is in the state already.
   - older than the last source → ask whether to add it anyway (`--force`); a late meeting may reopen things already closed, so say which.
3. `sdlc discovery add <file> --name "<name>"`. Its label (`<date> <name>`) is how every piece of evidence cites this meeting. A PDF gets a `.txt` beside it: read that if you cannot read PDFs.

## 2. Extract from the new transcript
Read it once, start to end, and note candidates of five kinds:
- **Feature**: something the client wants the product to do (or no longer wants).
- **Action item**: someone agreed to do something (send a file, schedule a call, estimate). Who and what.
- **Decision**: a choice that closes an option ("refunds only by card").
- **Question**: something left open that someone must answer; who must answer it. Two people saying opposite things is a question with status `contradiction`.
- **Risk**: something that may go wrong (deadline, dependency, a legal constraint).

For each, keep the evidence: timestamp if the transcript has one (`mm:ss`), the speaker, and a short literal quote (at most ~20 words, in the meeting's language). Minutes without timestamps or speakers: cite the minutes (`<label> · minutes: "…"`). Skip small talk and anything nobody asked for.

## 3. Plan the merge
1. Read `<dir>/STATUS.md` (topics, open questions, open work).
2. For each candidate, `sdlc discovery search <two or three key words>`: is it already a row (here or in `_baseline`)? Then it is an **update**, not a new row.
3. Decide per candidate: new row · new evidence on an existing row · status change (question answered, decision superseded, action done) · answer that unblocks features (clear their Blocked by) · nothing.
4. Topic: the existing one that fits; a new topic only for an area with at least two items; otherwise `_unsorted`.
5. Read only the topic files you will touch.

## 4. Cross-check new and reopened features
Do this for every feature you add or move back to `requested`/`reimplement`:
- **Tracker** (only if `sdlc tracker enabled` exits 0): `sdlc tracker search "<key words>" --limit 20`, one search per feature. An issue that clearly is the same thing → its key in Ticket; a likely one → `~KEY`; none → `no ticket`; tracker unreachable → `not verified`. A **closed** issue that already solved it: the feature is `done` unless the client clearly asks for it again; then `reimplement`, with `reason: …` in the evidence (what is different now).
- **Code on the base branch** (`discovery.base_branch`, else `vcs.default_branch`): `git grep -n -i "<word>" <base> -- <likely paths>`. Never check out or change branches. Repo: `missing`, `partial` or `exists`. `done` needs `exists` or a confirmed ticket.
- **Work in flight**: `sdlc discovery branches --json`, once per run. A branch touching the same area or carrying the same ticket is a conflict to report (step 7); put its ticket in Ticket if it has one.
- **Roadmaps**: a story in `changes/_roadmaps/*/roadmap.md` with `- source: <topic>#F<n>` already covers that feature; put the story's `- key:` in Ticket once it has one, so `sdlc roadmap new --from-discovery` does not plan it twice.

## 5. Write
- Edit the rows in place. New IDs continue the topic's numbering (`F4` after `F3`); never renumber, never delete a row: change its status.
- New evidence goes after the old one, separated by `<br>`: `<label> · 12:40 · Laura: "they must cancel alone"`.
- Owner and To start with `Team:` or `Client:`. The team side is `discovery.team` in the config (or the people in `roles`); anyone else who speaks is the client side unless the transcript says otherwise.
- Question `Since` is the date of the source that first raised it; when it is answered, write the Answer, set it `answered` and clear it from every Blocked by.
- One line per touched topic at the end of its Changes log: `- <label>: F4 added, Q1 answered (F2 unblocked)`.
- A new topic: copy `templates/topic.md` to `<dir>/topics/<topic>.md` (kebab-case name) and fill the frontmatter.

## 6. Check, status, follow-up, commit
1. `sdlc discovery validate` until it prints no `✗`. Read the `!` warnings and fix them unless there is a reason.
2. `sdlc discovery status` rewrites STATUS.md.
3. `sdlc discovery followup --write` drafts the client follow-up in `followups/`; reword it so it reads well, in the language of `discovery.followup_locale` (or the project's), keeping the `topic#ID` references. Nothing is sent.
4. Commit only the discovery folder: `git add <dir> && git commit -m "discovery: <label>"`. If `discovery.commit_transcripts` is false the transcripts stay local (gitignored); `_sources.md` still records their hash.

**Without a person** (the prompt says you are running headless, for example from the dashboard): do not ask. Unknown date or a source older than the last one → stop and report it. Unsure who owns an item → write your best guess and add a question to the team about it.

## 7. Report (at most 10 lines)
The source; how many rows added, updated, questions answered; the **conflicts** (requested but already built, a closed ticket asked again, a branch already working on it, contradictions); the questions waiting on the client; and the next step: "features ready to build (no ticket, not blocked) → `sdlc roadmap new <slug> --from-discovery <topic>`; the follow-up draft is in `<dir>/followups/…`."
