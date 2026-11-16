#!/bin/sh
# Eval setup: a discovery already running (the 2026-09-01 kickoff processed, one topic with an open question), committed,
# plus the files named as arguments copied to the project root for the agent to process.
set -e
fx="$EVAL_DIR/fixtures/discovery"
cp "$fx/kickoff-2026-09-01.md" kickoff-2026-09-01.md
.sdlc/bin/sdlc discovery add kickoff-2026-09-01.md --name Kickoff --type client >/dev/null
rm kickoff-2026-09-01.md
cp "$fx/currencies.md" changes/_discovery/topics/currencies.md
.sdlc/bin/sdlc discovery status >/dev/null
for f in "$@"; do cp "$fx/$f" "$f"; done
"$EVAL_DIR/fixtures/commit.sh" "eval setup: discovery"
