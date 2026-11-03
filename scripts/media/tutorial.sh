#!/usr/bin/env bash
# The tutorial (docs/start/tutorial.md, docs/es/empezar/tutorial.md) as shell functions, so the recordings and
# tests/docs/tutorial.sh replay exactly what the pages tell people to type. Source it, then:
#   tut_repo <dir> <en|es>    copy examples/starter-todo, git init, first commit
#   tut_install               npm i -D the tool (SDLC_TGZ, else SDLC_BIN) + sdlc init + commit
#   tut_quick                 part 1: quick lane, agent, merge into main
#   tut_loop [until]          part 2: new → intent → spec → plan → build → merge; stops before <until>
MEDIA="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$MEDIA/../.." && pwd)"
export DEMO_LOCALE="${DEMO_LOCALE:-en}"

# What the pages type, per locale.
tut_strings() {
  if [ "$DEMO_LOCALE" = es ]; then
    QUICK_WHAT="La lista muestra cuántas tareas hay"; QUICK_SLUG=la-lista-muestra-cuantas-tareas-hay
    SLUG=marcar-hecha; TITLE="Marcar una tarea como hecha"; ITEM="comprar leche"; GO="dale"
  else
    QUICK_WHAT="List shows how many to-dos there are"; QUICK_SLUG=list-shows-how-many-to-dos-there-are
    SLUG=mark-done; TITLE="Mark a to-do as done"; ITEM="buy milk"; GO="go"
  fi
}

# `npx sdlc` without the registry: the installed tarball, or SDLC_BIN (a local build).
npx() {
  if [ "${1:-}" = sdlc ] && [ ! -x node_modules/.bin/sdlc ]; then shift; ${SDLC_BIN:?set SDLC_BIN or SDLC_TGZ} "$@"; else command npx "$@"; fi
}
# `npm i -D @morsadev/sdlc` installs SDLC_TGZ when set (a build of this checkout), the registry otherwise.
npm() {
  if [ "$*" = "i -D @morsadev/sdlc" ] && [ -n "${SDLC_TGZ:-}" ]; then command npm i -D "$SDLC_TGZ" --no-audit --no-fund; else command npm "$@"; fi
}
agent() { bash "$MEDIA/demo-agent.sh" "${1#/sdlc-}"; }
export -f npx npm agent 2>/dev/null || true

# Every step runs in the repo tut_repo made, never in this checkout.
tut_cd() { [ -n "${TUT_DIR:-}" ] && cd "$TUT_DIR" || { echo "tutorial: run tut_repo first" >&2; return 1; }; }

tut_repo() {
  tut_strings
  local dir="${1:?tut_repo <dir>}"
  mkdir -p "$(dirname "$dir")" && dir="$(cd "$(dirname "$dir")" && pwd)/$(basename "$dir")"
  case "$dir/" in "$REPO"/*) echo "tut_repo: $dir is inside this checkout; use a temp dir" >&2; return 1 ;; esac
  rm -rf "$dir" && cp -R "$REPO/examples/starter-todo" "$dir" || return 1
  cd "$dir" || return 1
  TUT_DIR="$dir"
  [ "$(git rev-parse --show-toplevel 2>/dev/null)" = "$REPO" ] && { echo "tut_repo: refusing to run git in $REPO" >&2; return 1; }
  rm -rf node_modules todos.json
  git init -q -b main
  git config user.name "Ana Dev" && git config user.email ana@example.com
  git add -A && git commit -qm "initial"
}

tut_install() {
  tut_cd || return 1
  if [ -n "${SDLC_TGZ:-}" ]; then npm i -D @morsadev/sdlc >/dev/null; fi
  local loc=(); [ "$DEMO_LOCALE" = es ] && loc=(--locale es)
  npx sdlc init "${loc[@]}" --preset solo --yes >/dev/null
  git add -A && git commit -qm "chore: ai-sdlc"
}

tut_quick() {
  tut_cd || return 1
  npx sdlc quick "$QUICK_WHAT" >/dev/null
  agent /sdlc-quick >/dev/null
  git checkout -q main && git merge -q --no-edit "change/$QUICK_SLUG"
}

tut_loop() {
  local until="${1:-}"
  tut_cd || return 1
  npx sdlc new "$SLUG" --title "$TITLE" >/dev/null
  for s in intent spec plan; do
    [ "$until" = "$s" ] && return 0
    agent "/sdlc-$s" >/dev/null
    [ "$until" = "approve-$s" ] && return 0
    npx sdlc approve "$SLUG" "$s" -m "$GO" >/dev/null
  done
  [ "$until" = build ] && return 0
  agent /sdlc-build >/dev/null
  [ "$until" = merge ] && return 0
  git checkout -q main && git merge -q --no-edit "change/$SLUG"
}
