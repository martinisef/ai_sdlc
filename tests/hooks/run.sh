#!/usr/bin/env bash
# Hook tests: pipe Claude Code hook payloads into `sdlc hook` and assert exit code (+ message).
# The cases are the ones the original bash hooks were written against (behavioural parity).
# Usage: bash tests/hooks/run.sh          (SDLC="node plugins/ai-sdlc/bin/sdlc.mjs" to test the bundle)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../.."
SDLC="${SDLC:-node --conditions=source $REPO/packages/cli/src/main.ts}"
# guardrail (as the old per-script hooks were named) → hook event
event_of() {
  case "$1" in
    protect-paths.sh|secrets-guard.sh|test-lock.sh|production-gate.sh) echo pre-tool ;;
    format-on-edit.sh) echo post-tool ;;
    plan-sync.sh) echo stop ;;
    session-start.sh) echo session-start ;;
  esac
}
PASS=0; FAIL=0

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PROJ="$TMP/proj"
mkdir -p "$PROJ/.claude" "$PROJ/changes/2026-11-claims-status" "$PROJ/src" "$PROJ/tests"
git -C "$PROJ" init -q -b main
git -C "$PROJ" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init

cat > "$PROJ/.claude/sdlc.json" <<'EOF'
{
  "version": 1,
  "commands": { "test": "true" },
  "format_on_edit": { "*.txt": "printf formatted > {file}", "*.bad": "false" },
  "protected_paths": ["migrations/**", "src/gen/**"],
  "test_globs": ["tests/**", "**/*_test.py"],
  "secret_patterns_extra": ["INTERNAL-[0-9]{8}"],
  "production_gate": { "patterns": ["deploy.*prod"], "approval_env": "RELEASE_APPROVAL" }
}
EOF

unset SDLC_PROJECT_DIR CURSOR_PROJECT_DIR
export CLAUDE_PROJECT_DIR="$PROJ"

# expect <name> <script> <expected-exit> <json> [stderr-substring]
expect() {
  local name="$1" script="$2" want="$3" json="$4" needle="${5:-}" got err
  err="$(printf '%s' "$json" | $SDLC hook "$(event_of "$script")" --agent claude 2>&1 >/dev/null)"; got=$?
  if [ "$got" = "$want" ] && { [ -z "$needle" ] || printf '%s' "$err" | grep -q -- "$needle"; }; then
    PASS=$((PASS+1)); printf '  ok   %s\n' "$name"
  else
    FAIL=$((FAIL+1)); printf '  FAIL %s (exit %s, want %s)\n%s\n' "$name" "$got" "$want" "$err"
  fi
}

edit() { printf '{"tool_name":"Edit","tool_input":{"file_path":"%s","old_string":"a","new_string":"%s"}}' "$1" "$2"; }
write() { printf '{"tool_name":"Write","tool_input":{"file_path":"%s","content":"%s"}}' "$1" "$2"; }
bashcmd() { printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"; }

echo "protect-paths"
expect "blocks src/gen"            protect-paths.sh 2 "$(edit "$PROJ/src/gen/x.py" y)" "ruta protegida"
expect "blocks migrations (rel)"   protect-paths.sh 2 "$(edit "migrations/001.sql" y)"
expect "allows src/app.py"         protect-paths.sh 0 "$(edit "$PROJ/src/app.py" y)"
expect "multiedit blocked"         protect-paths.sh 2 "{\"tool_name\":\"MultiEdit\",\"tool_input\":{\"file_path\":\"$PROJ/src/gen/a.py\",\"edits\":[]}}"

echo "secrets-guard"
expect "blocks AWS key"            secrets-guard.sh 2 "$(write "$PROJ/a.py" 'k = AKIAABCDEFGHIJKLMNOP')" "credencial"
expect "blocks private key"        secrets-guard.sh 2 "$(write "$PROJ/k.pem" '-----BEGIN RSA PRIVATE KEY-----')"
expect "blocks generic token"      secrets-guard.sh 2 "$(edit "$PROJ/a.py" 'api_key = \"abcdefghijklmnop1234\"')"
expect "blocks extra pattern"      secrets-guard.sh 2 "$(edit "$PROJ/a.py" 'id=INTERNAL-12345678')"
expect "blocks in multiedit"       secrets-guard.sh 2 "{\"tool_name\":\"MultiEdit\",\"tool_input\":{\"file_path\":\"$PROJ/a.py\",\"edits\":[{\"old_string\":\"x\",\"new_string\":\"ghp_abcdefghijklmnopqrstuvwxyz0123456789\"}]}}"
expect "allows env lookup"         secrets-guard.sh 0 "$(edit "$PROJ/a.py" 'api_key = os.environ[\"API_KEY\"]')"
expect "allows normal code"        secrets-guard.sh 0 "$(write "$PROJ/a.py" 'def total(x): return x * 2')"

echo "test-lock"
expect "no lock → allows tests"    test-lock.sh 0 "$(edit "$PROJ/tests/test_a.py" y)"
touch "$PROJ/.claude/.sdlc-fix-lock"
expect "lock → blocks tests/"      test-lock.sh 2 "$(edit "$PROJ/tests/test_a.py" y)" "test-lock"
expect "lock → blocks *_test.py"   test-lock.sh 2 "$(edit "$PROJ/foo_test.py" y)"
expect "lock → blocks nested"      test-lock.sh 2 "$(edit "$PROJ/pkg/foo_test.py" y)"
expect "lock → allows src"         test-lock.sh 0 "$(edit "$PROJ/src/app.py" y)"
rm "$PROJ/.claude/.sdlc-fix-lock"

echo "production-gate"
expect "blocks prod deploy"        production-gate.sh 2 "$(bashcmd 'make deploy ENV=production')" "release"
expect "allows staging deploy"     production-gate.sh 0 "$(bashcmd 'make deploy ENV=staging')"
expect "allows tests"              production-gate.sh 0 "$(bashcmd 'make test')"
RELEASE_APPROVAL=CHG-123 expect "approval → allows" production-gate.sh 0 "$(bashcmd 'make deploy ENV=production')"
expect "commit msg mentioning deploy" production-gate.sh 0 "$(bashcmd 'git commit -m \"docs: make deploy ENV=production needs approval\"')"
expect "chained after commit → blocks" production-gate.sh 2 "$(bashcmd 'git commit -m x && make deploy ENV=production')"
expect "env prefix → blocks"       production-gate.sh 2 "$(bashcmd 'FOO=1 make deploy ENV=production')"
expect "piped → blocks"            production-gate.sh 2 "$(bashcmd 'yes | ./deploy.sh --env prod')"

echo "format-on-edit"
printf 'x' > "$PROJ/a.txt"
expect "runs formatter"            format-on-edit.sh 0 "$(write "$PROJ/a.txt" x)"
if [ "$(cat "$PROJ/a.txt")" = "formatted" ]; then PASS=$((PASS+1)); echo "  ok   formatter changed file"; else FAIL=$((FAIL+1)); echo "  FAIL formatter did not run"; fi
printf 'x' > "$PROJ/a.bad"
expect "reports formatter failure" format-on-edit.sh 2 "$(write "$PROJ/a.bad" x)" "formatter"
expect "no formatter → ok"         format-on-edit.sh 0 "$(write "$PROJ/src/app.py" x)"

echo "plan-sync"
git -C "$PROJ" checkout -q -b change/claims-status
printf -- '---\nstatus: approved\n---\n# Plan\n' > "$PROJ/changes/2026-11-claims-status/plan.md"
git -C "$PROJ" add -A && git -C "$PROJ" -c user.email=t@t -c user.name=t commit -qm plan
expect "clean tree → ok"           plan-sync.sh 0 '{"stop_hook_active":false}'
printf 'code' > "$PROJ/src/app.py"
expect "code w/o plan → remind"    plan-sync.sh 2 '{"stop_hook_active":false}' "plan.md"
expect "stop_hook_active → ok"     plan-sync.sh 0 '{"stop_hook_active":true}'
printf 'more' >> "$PROJ/changes/2026-11-claims-status/plan.md"
expect "code + plan → ok"          plan-sync.sh 0 '{"stop_hook_active":false}'

echo "session-start"
# the branch already has code commits after the approved plan (a.txt, a.bad above) → stage "building"
out="$(printf '{}' | $SDLC hook session-start --agent claude)"
if printf '%s' "$out" | grep -q "changes/2026-11-claims-status — etapa: building"; then PASS=$((PASS+1)); echo "  ok   reports active change + stage"; else FAIL=$((FAIL+1)); echo "  FAIL session-start: $out"; fi

echo "no config → everything allows"
mv "$PROJ/.claude/sdlc.json" "$PROJ/.claude/sdlc.json.off"
expect "protect-paths"             protect-paths.sh 0 "$(edit "$PROJ/src/gen/x.py" y)"
expect "secrets-guard"             secrets-guard.sh 0 "$(write "$PROJ/a.py" 'AKIAABCDEFGHIJKLMNOP')"
expect "production-gate"           production-gate.sh 0 "$(bashcmd 'deploy production')"
expect "plan-sync"                 plan-sync.sh 0 '{"stop_hook_active":false}'

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = 0 ]
