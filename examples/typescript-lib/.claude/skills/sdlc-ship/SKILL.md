---
name: sdlc-ship
description: Stage 5 (Deploy) of the AI-native loop. Runs the pre-checks, opens or updates the PR/MR (GitHub, GitLab or Bitbucket) linking intent/spec/plan and the ticket, and with --babysit handles review comments and red checks until it is ready for code owner approval. Use when a change is implemented and the PR needs to be opened, or to "babysit" an open PR.
argument-hint: "[--babysit]"
---

# /sdlc-ship — PR ready for the human gate

The agent does everything up to the gate and nothing beyond it: **it does not approve or merge**. Approval belongs to a code owner via branch protection.

Loop CLI: `sdlc` (if it is not on the PATH: `.sdlc/bin/sdlc`). Provider: `sdlc vcs provider`.

## 1. Pre-checks (all mandatory)
- Build, test and lint from `.sdlc/config.json → commands` green. Save the output.
- `plan.md` exists and is `approved`; if the diff departs from the plan, the deviations are recorded.
- No pending `.sdlc/fix-lock`.
- Branch pushed (`git push -u origin HEAD`).
If something fails, fix it or report it; do not open a red PR.

## 2. Open or update the PR/MR
1. `sdlc vcs pr-current` → if one is already open (for example the intent draft), update it; otherwise, create it.
2. Body (temporary file):
   ```
   ## What and why
   <summary from intent/spec>
   ## Artifacts
   - Intent: changes/<slug>/intent.md · Spec: …/spec.md · Plan: …/plan.md
   - Ticket: <KEY + link> (if any)
   ## Deviations from the plan
   <none | list>
   ## Testing
   <what was run and how: summarized build/test/lint output, verifier verdict, manual checks>
   ## Risk
   <tier from `sdlc risk` (low | medium | high) and why; high → requires tech lead>
   ## How to revert
   <revert the PR | turn off the flag `<name>` | the migration's down step; anything that cannot be undone>
   ```
   **Testing**, **Risk** and **How to revert** are mandatory and must be filled in: without them `sdlc/gates` stays red (`ci.pr_sections`). Risk states at least the tier `sdlc risk` computes; never a lower one. If the change cannot be reverted by reverting the PR (data migration, external call, published contract), say how to undo it, or say that it cannot be undone and put it behind a flag.
3. Title: `<KEY> <title>` if there is a ticket (Jira links it), otherwise `<title>`.
4. `sdlc vcs pr-create --title "<title>" --body-file <tmp>` (or edit the existing one with the provider's CLI). Show the link.
5. Tracker: `ship` transition + comment with the link to the PR. If it fails, warn and continue.

## 3. --babysit mode
Loop until the PR is green and only waiting for human approval (at most ~5 iterations; after that, report what is left):
1. `sdlc vcs pr-checks <n>` → if there are red checks, read the logs, fix, run tests locally, commit + push.
2. `sdlc vcs pr-comments <n>` → for each unresolved comment: if it is a clear change, apply it; if it is a decision (design, scope), **do not make it yourself**: reply on the PR summarizing the options and leave it to the human.
3. Reply on the PR with what was addressed (`pr-comment`).
4. If a review flags the same mistake a second time, add the correction to `CLAUDE.md` → "Things Claude gets wrong" in the same PR.

## Wrap-up
Link to the PR, check status, comments pending a human decision, and who has to approve (code owner; tech lead if `risk: high`). After the merge, the pipeline transitions the ticket to *Done*.

**You land it, you own it.** Remind the person directing the agent that the merged change is theirs: they watch it roll out (flag, staged release, dashboards) and they revert it if it misbehaves, following the PR's "How to revert". The reviewers checked it; they do not own it.
