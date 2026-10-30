#!/bin/sh
# Eval setup: commit everything under the current directory as a non-agent identity.
set -e
git add -A . && git -c user.email=eval@example.com -c user.name="Eval Setup" commit -qm "${1:-eval setup}"
