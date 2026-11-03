#!/usr/bin/env bash
# The beginner tutorial, replayed: runs what docs/start/tutorial.md and docs/es/empezar/tutorial.md tell people
# to type on a copy of examples/starter-todo (the agent steps by scripts/media/demo-agent.sh), and checks that
# the output the pages show is still what the tool prints. Then checks that both languages have the same pages.
# Usage: bash tests/docs/tutorial.sh          (SDLC="node plugins/ai-sdlc/bin/sdlc.mjs" to test the bundle)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
export SDLC_BIN="${SDLC:-node --conditions=source $REPO/packages/cli/src/main.ts}"
unset SDLC_PROJECT_DIR CLAUDE_PROJECT_DIR CURSOR_PROJECT_DIR SDLC_TGZ
PASS=0; FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"

ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
ko() { FAIL=$((FAIL+1)); printf '  FAIL %s\n%s\n' "$1" "$2"; }
# shows <name> <output> <text>: the command printed <text>
shows() { case "$2" in *"$3"*) ok "$1" ;; *) ko "$1" "    want: $3"$'\n'"    got:  $2" ;; esac; }
# documented <page> <text>: the page still shows <text> (dates and the reader's name normalised)
documented() {
  local text="${2//2026-11/$(date +%Y-%m)}"
  if sed -e "s/Your Name/Ana Dev/g; s/Tu Nombre/Ana Dev/g; s/2026-11/$(date +%Y-%m)/g" "$REPO/$1" | grep -qF -- "$text"; then ok "$1 shows it"
  else ko "$1 shows it" "    missing: $text"; fi
}
both() { shows "$1" "$2" "$3"; documented "$PAGE" "$3"; }

for loc in en es; do
  echo "tutorial ($loc)"
  export DEMO_LOCALE="$loc"
  # shellcheck source=../../scripts/media/tutorial.sh
  source "$REPO/scripts/media/tutorial.sh"
  if [ "$loc" = es ]; then PAGE=docs/es/empezar/tutorial.md; INSTALL=docs/es/empezar/instalar.md; else PAGE=docs/start/tutorial.md; INSTALL=docs/start/install.md; fi
  tut_repo "$TMP/$loc/my-todo" || { ko "tut_repo" "could not prepare the repo"; continue; }
  today="$(date +%Y-%m)"

  out="$(npm test 2>&1)"; shows "starter: npm test" "$out" "pass 3"
  loc_flag=(); [ "$loc" = es ] && loc_flag=(--locale es)
  out="$(npx sdlc init ${loc_flag[@]+"${loc_flag[@]}"} --preset solo --yes 2>&1)"
  shows "init" "$out" "✓ ai-sdlc ready · preset solo · typescript · agents: claude"
  documented "$INSTALL" "✓ ai-sdlc ready · preset solo · typescript · agents: claude"
  git add -A && git commit -qm "chore: ai-sdlc"
  out="$(npx sdlc doctor 2>&1)"
  bad="$(printf '%s\n' "$out" | grep -E '^(✗|!)' | grep -v 'VCS provider unknown' || true)"
  [ -z "$bad" ] && ok "doctor: only the documented warning" || ko "doctor: only the documented warning" "$bad"

  echo " part 1"
  out="$(npx sdlc quick "$QUICK_WHAT" 2>&1)"
  both "quick" "$out" "created changes/$today-$QUICK_SLUG/intent.md on branch change/$QUICK_SLUG (quick lane: no spec, no plan)"
  agent /sdlc-quick >/dev/null || ko "agent quick" "demo agent failed"
  out="$(node src/cli.js add "$ITEM" && node src/cli.js list)"; shows "list counts" "$out" "(1 to-dos)"
  out="$(npx sdlc quick --check 2>&1)"; both "quick --check" "$out" "ok: 2/10 code files, no high-risk paths"
  git checkout -q main && git merge -q --no-edit "change/$QUICK_SLUG" && ok "merge quick change" || ko "merge quick change" ""
  rm -f todos.json

  echo " part 2"
  out="$(npx sdlc new "$SLUG" --title "$TITLE" 2>&1)"
  both "new" "$out" "created changes/$today-$SLUG/intent.md on branch change/$SLUG"
  agent /sdlc-intent >/dev/null
  out="$(npx sdlc next 2>&1)"
  if [ "$loc" = es ]; then both "next: intent" "$out" "Te toca decidir el intent de $SLUG → sdlc approve $SLUG intent"
  else both "next: intent" "$out" "Your call: the intent of $SLUG → sdlc approve $SLUG intent"; fi

  git config user.name Claude && git config user.email noreply@anthropic.com
  out="$(npx sdlc approve "$SLUG" intent 2>&1)"; shows "an agent cannot approve" "$out" "looks like an agent or bot; a person must approve"
  git config user.name "Ana Dev" && git config user.email ana@example.com
  out="$(npx sdlc approve "$SLUG" intent -m "$GO" 2>&1)"; both "approve intent" "$out" "changes/$today-$SLUG/intent.md approved by Ana Dev"

  agent /sdlc-spec >/dev/null
  out="$(npx sdlc approve "$SLUG" spec 2>&1)"; shows "approve spec" "$out" "spec.md approved by Ana Dev"

  echo "// wip" >> src/todos.js && git commit -qam "feat($SLUG): before the plan"
  out="$(npx sdlc hook pre-push --agent git </dev/null 2>&1)"; code=$?
  if [ "$loc" = es ]; then both "push before the plan is blocked" "$out" "Bloqueado por ai-sdlc: la rama change/$SLUG tiene cambios de código pero changes/$today-$SLUG/plan.md no está aprobado (etapa: spec-approved)"
  else both "push before the plan is blocked" "$out" "Blocked by ai-sdlc: branch change/$SLUG has code changes but changes/$today-$SLUG/plan.md is not approved (stage: spec-approved)"; fi
  [ "$code" != 0 ] && ok "blocked push exits non-zero" || ko "blocked push exits non-zero" "exit $code"
  git reset -q --hard HEAD~1

  agent /sdlc-plan >/dev/null
  out="$(npx sdlc approve "$SLUG" plan 2>&1)"; shows "approve plan" "$out" "plan.md approved by Ana Dev"
  agent /sdlc-build >/dev/null || ko "agent build" "demo agent failed"
  out="$(npm test 2>&1)"; shows "npm test after build" "$out" "pass 6"
  out="$(node src/cli.js add "$ITEM" && node src/cli.js done 1 && node src/cli.js list)"; both "done" "$out" "1. [x] $ITEM"
  out="$(npx sdlc hook pre-push --agent git </dev/null 2>&1)" && ok "push after the plan is allowed" || ko "push after the plan is allowed" "$out"
  cd "$TMP"
done

echo "same pages in both languages"
pairs="what-is-it:que-es install:instalar tutorial:tutorial daily:dia-a-dia troubleshooting:problemas"
for p in $pairs; do
  en="docs/start/${p%%:*}.md"; es="docs/es/empezar/${p##*:}.md"
  [ -f "$REPO/$en" ] && [ -f "$REPO/$es" ] || { ko "$en / $es exist" ""; continue; }
  a="$(grep -c '^##' "$REPO/$en")"; b="$(grep -c '^##' "$REPO/$es")"
  [ "$a" = "$b" ] && ok "$en and $es have $a headings" || ko "$en and $es have the same headings" "    en: $a, es: $b"
  for m in $(grep -o '/media/[a-z-]*-en\.[a-z0-9]*' "$REPO/$en" | sort -u); do
    f="$REPO/docs/public${m}"; fes="${f/-en./-es.}"
    [ -f "$f" ] && [ -f "$fes" ] && grep -q "${m/-en./-es.}" "$REPO/$es" && ok "$m in both" || ko "$m in both" "    missing file or not used in $es"
  done
done
for link in /start/what-is-it /start/install /start/tutorial /start/daily /start/troubleshooting /es/empezar/que-es /es/empezar/instalar /es/empezar/tutorial /es/empezar/dia-a-dia /es/empezar/problemas; do
  grep -q "link: '$link'" "$REPO/docs/.vitepress/config.mts" && ok "sidebar: $link" || ko "sidebar: $link" ""
done

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = 0 ]
