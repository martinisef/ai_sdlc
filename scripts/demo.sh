#!/usr/bin/env bash
# Scripted demo of the loop on a throwaway repo, no agent needed (the "agent" steps are plain edits).
#   bash scripts/demo.sh              uses the local bundle (npm run build first)
#   SDLC="npx -y @morsadev/sdlc" bash scripts/demo.sh
#   DEMO_DELAY=1.5 bash scripts/demo.sh   pause between steps (for recordings)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SDLC="${SDLC:-node $REPO/packages/cli/dist/sdlc.mjs}"
export SDLC_BIN="$SDLC"
DELAY="${DEMO_DELAY:-0}"
D="$(mktemp -d)/shop"
trap 'rm -rf "$(dirname "$D")"' EXIT

step() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; sleep "$DELAY"; }
sdlc() { printf '\033[2m$ sdlc %s\033[0m\n' "$*"; SDLC_PROJECT_DIR="$D" $SDLC "$@" || true; sleep "$DELAY"; }

mkdir -p "$D/src/shop" "$D/tests" "$D/src/shop/auth"
cd "$D"
git init -q -b main
git config user.name "Ana Dev"
git config user.email ana@example.com
git remote add origin git@github.com:acme/shop.git
printf '[project]\nname = "shop"\nversion = "0.1.0"\n' > pyproject.toml
printf 'def health():\n    return {"status": "ok"}\n' > src/shop/app.py
printf 'def login(user, password):\n    return False\n' > src/shop/auth/login.py
printf 'from shop.app import health\n\ndef test_health():\n    assert health()["status"] == "ok"\n' > tests/test_app.py
git add -A && git commit -qm "initial"

step "1. One command sets up the repo"
sdlc init --preset solo --yes
python3 - <<'EOF'
import json; p='.sdlc/config.json'; c=json.load(open(p))
c['risk']={'high_risk_paths':['src/shop/auth/**']}; c['commands']={'build':'true','test':'true','lint':'true'}
json.dump(c,open(p,'w'),indent=2)
EOF
git add -A && git commit -qm "chore: ai-sdlc" && git checkout -q main
sdlc next

step "2. A small change takes the quick lane"
sdlc quick "Health returns the service name"
sdlc next
printf 'def health():\n    return {"status": "ok", "service": "shop"}\n' > src/shop/app.py
sdlc quick --check
git add -A && git commit -qm "feat(health-returns-the-service-name): service name"

step "   ...and is stopped when it reaches a high-risk path"
printf 'def login(user, password):\n    return True\n' > src/shop/auth/login.py
sdlc quick --check
git checkout -q -- src/shop/auth/login.py

step "3. A real change goes through the full loop; sdlc next leads the way"
git checkout -q main
sdlc new export-orders --title "Export orders as CSV"
sdlc next
INTENT="$(ls -d changes/*-export-orders)/intent.md"
printf '\n## Problem\nFinance exports orders by hand every month.\n' >> "$INTENT"
git add -A && git commit -qm "docs(export-orders): intent"
step "   Agents cannot approve (git identity Claude <noreply@anthropic.com>)"
git config user.name Claude && git config user.email noreply@anthropic.com
sdlc approve export-orders intent
git config user.name "Ana Dev" && git config user.email ana@example.com
step "   People can"
sdlc approve export-orders intent -m "go"
sdlc next

step "4. Guardrails hold whatever the agent tries"
hook() { printf '\033[2m(agent) %s\033[0m\n' "$1"; printf '%s' "$2" | SDLC_PROJECT_DIR="$D" $SDLC hook pre-tool --agent claude 2>&1 | head -2 || true; sleep "$DELAY"; }
hook "runs terraform apply" '{"tool_name":"Bash","tool_input":{"command":"terraform apply"}}'
hook "writes an AWS key into src/shop/keys.py" '{"tool_name":"Write","tool_input":{"file_path":"src/shop/keys.py","content":"K = \"AKIAABCDEFGHIJKLMNOP\""}}'

step "5. How far changes get"
sdlc status
sdlc metrics --funnel
printf '\nDemo repo was %s (removed on exit). Real walkthrough: docs/guide/first-change.md\n' "$D"
