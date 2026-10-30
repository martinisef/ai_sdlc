#!/bin/sh
# Eval setup: stage.sh <change-dir> <fixture> <artifact[:status]>... copies fixture artifacts into
# changes/<change-dir>/ (optionally overriding their status) and commits, so the agent starts from that stage.
set -e
dir="changes/$1"; fx="$EVAL_DIR/fixtures/$2"; shift 2
mkdir -p "$dir"
for spec in "$@"; do
  f="${spec%%:*}"
  cp "$fx/$f.md" "$dir/$f.md"
  if [ "$f" != "$spec" ]; then sed -i.bak "s/^status: .*/status: ${spec#*:}/" "$dir/$f.md" && rm "$dir/$f.md.bak"; fi
done
"$EVAL_DIR/fixtures/commit.sh" "eval setup: $dir"
