---
name: sdlc-intent
description: Stage 1 (Plan) of the AI-native loop. Captures an idea, ticket or incident as changes/<slug>/intent.md through guided brainstorming, creates the change/<slug> branch and leaves it ready for the Product Owner's review. Use when someone wants to start a new change, has an idea, brings a Jira ticket (e.g. "/sdlc-intent PROJ-123") or asks to "capture the intent".
argument-hint: "[PROJ-123 | short description of the idea]"
---

# /sdlc-intent — capture the intent

Goal: get the idea written down **once, in the words of whoever had it**, as a versioned artifact the next stage can use. No backlog grooming: brainstorm until the idea is concrete.

Loop CLI: `sdlc` (if it is not on the PATH: `.sdlc/bin/sdlc`). Project config: `.sdlc/config.json`.

## 0. Prerequisites
- If `.sdlc/config.json` does not exist, say the project is not configured and offer `/sdlc-setup`. You can continue anyway, using the template below and without Jira integration.
- If there are uncommitted changes on the current branch, warn before creating a new branch.

## 1. Input
- **With a ticket** (`$ARGUMENTS` looks like an `ABC-123` key) and `tracker.provider = jira`: read the ticket with the Atlassian MCP if it is available in the session; otherwise, with `sdlc tracker get <KEY>`. Use the summary and description as a starting point. `origin: ticket`.
- **With text**: it is the initial description of the idea. `origin: idea`.
- **No arguments**: ask the person to describe the problem in their own words.
- If Jira fails (credentials, network), say so in one line and continue without Jira: the tracker supports the loop, it does not block it.

## 2. Brainstorming
Ask the questions an analyst would ask, **a few at a time** (2-3 per turn, with AskUserQuestion when there are clear options):
- What can't be done today? Who does it affect and how much?
- What does "better" look like? How do we know it worked?
- Which systems and users does it touch?
- Constraints? (data/PII, security, compliance, timelines, technology)
- What is explicitly out of scope?
If the repo has code, you can look at it to ask more precise questions, but **do not propose technical solutions**: that is Stage 2-3.
Stop when the problem, the outcome and the constraints are clear. Whatever is still open goes to "Open questions".

## 3. Create the change
1. Short kebab-case slug (`claims-status`). With a ticket: `PROJ-123-claims-status`.
2. Folder: with a ticket `changes/<KEY>-<slug>/`; without a ticket `changes/<YYYY-MM>-<slug>/`.
3. Branch: `git switch -c change/<slug>` from the up-to-date default branch (`vcs.default_branch`). With a ticket: `change/<KEY>-<slug>`. The key in the branch name makes Jira's native integration link it automatically.
4. Write `intent.md` from `changes/_templates/intent.md` (if it does not exist in the repo, use the one at `<base directory>/../sdlc-setup/scaffold/changes/_templates/intent.md`). Frontmatter: `change`, `status: draft`, `author` (name of whoever originated the idea, not yours), `origin`, `ticket`, `created` (today's date).
5. Show the intent and ask for corrections. Iterate until the person says it reflects what they meant.
6. Commit: `intent(<slug>): <title>` (+ ` [KEY]` if there is a ticket).

## 4. Jira (if `tracker.provider = jira`)
Depending on `tracker.mode`:
- **No ticket**: in `jira-sot` create the ticket (mandatory): `sdlc tracker create --summary "<title>" --body-file changes/<...>/intent.md`. In `linkage` offer to create it. In `repo-sot` it is optional. If one is created, rename the folder and branch to include the key and update `ticket:`.
- **linkage / repo-sot**: comment on the ticket with the intent's path and the commit SHA.
- **jira-sot**: write the intent into the ticket description (`set-description`) and comment with the SHA.
- `intent` transition if it is mapped: `sdlc tracker transition <KEY> intent`.

## 5. Gate: Product Owner
- Offer to push the branch and open a **draft PR/MR** for the PO to review: build the body from the intent's content and run `sdlc vcs pr-create --draft --title "[intent] <title>" --body-file <tmp>`.
- The PO accepts by changing to `status: accepted` and filling in `approved_by` (they can ask you to do it in a session; in that case record their name, not yours). That commit is the gate's record.
- If they reject it: `status: rejected` with the reason as a comment on the PR, and it is closed.

## 6. Wrap-up
Finish with one line: where the intent is, the link to the PR/ticket if any, and **the next step**: "When the PO accepts it → `/sdlc-spec`".
