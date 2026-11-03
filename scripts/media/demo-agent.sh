#!/usr/bin/env bash
# Stand-in for the agent in recordings and in the tutorial test: writes what /sdlc-<step> would write on the
# starter-todo repo, from fixtures, and commits it the way the skill does. A real agent writes different words.
#   demo-agent.sh quick | intent | spec | plan | build      (run from the project root; DEMO_LOCALE=en|es)
set -euo pipefail
F="$(cd "$(dirname "$0")" && pwd)/fixtures"
LOC="${DEMO_LOCALE:-en}"
step="${1:?usage: demo-agent.sh quick|intent|spec|plan|build}"
if [ "$LOC" = es ]; then slug=marcar-hecha; title="Marcar una tarea como hecha"; else slug=mark-done; title="Mark a to-do as done"; fi
# what the agent says, per locale: t <en> <es>
t() { if [ "$LOC" = es ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }
say() { printf '\033[36m  agent ▸ %s\033[0m\n' "$*"; sleep "${DEMO_PAUSE:-0}"; }
commit() { git add -A && git commit -qm "$1" -m "Co-Authored-By: Claude <noreply@anthropic.com>"; }

case "$step" in
  quick)
    say "$(t "test/todos.test.js: the list shows how many to-dos there are" "test/todos.test.js: la lista muestra cuántas tareas hay")"
    cp "$F/code/quick-todos.test.js" test/todos.test.js
    say "$(t "src/todos.js: format() adds the count" "src/todos.js: format() agrega la cantidad")"
    cp "$F/code/quick-todos.js" src/todos.js
    npm test --silent >/dev/null 2>&1 && say "$(t "npm test: 3 passing" "npm test: pasan 3")"
    commit "feat($(git branch --show-current | sed 's#^change/##')): list shows how many to-dos there are"
    say "$(t committed commiteado)"
    ;;
  intent|spec|plan)
    d="$(ls -d changes/*-"$slug" 2>/dev/null | head -1)"
    [ -n "$d" ] || { echo "no changes/*-$slug: run sdlc new $slug first" >&2; exit 1; }
    say "$(t "reads the code and writes" "lee el código y escribe") $d/$step.md"
    sed "s/^created: .*/created: $(date +%F)/" "$F/$LOC/$step.md" > "$d/$step.md"
    commit "$step($slug): $title"
    say "$(t committed commiteado)"
    ;;
  build)
    say "$(t "step 1: tests for R1 to R4 (they fail)" "paso 1: tests de R1 a R4 (fallan)")"
    cp "$F/code/todos.test.js" test/todos.test.js
    say "$(t "step 2: done() and format()" "paso 2: done() y format()")"
    cp "$F/code/todos.js" src/todos.js
    say "$(t "step 3: the done command" "paso 3: el comando done")"
    cp "$F/code/cli.js" src/cli.js
    npm test --silent >/dev/null 2>&1 && say "$(t "npm test: 6 passing" "npm test: pasan 6")"
    commit "feat($slug): $title"
    say "$(t committed commiteado)"
    ;;
  *) echo "unknown step: $step" >&2; exit 2 ;;
esac
