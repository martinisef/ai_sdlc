#!/usr/bin/env bash
# The beginner tutorial, replayed: runs what docs/start/tutorial.md and docs/es/empezar/tutorial.md tell people
# to type on a copy of examples/starter-todo (the agent steps by scripts/media/demo-agent.sh), and checks that
# the output the pages show is still what the tool prints. Then checks that both languages have the same pages.
# Usage: bash tests/docs/tutorial.sh          (SDLC="node plugins/ai-sdlc/bin/sdlc.mjs" to test the bundle)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
export SDLC_BIN="${SDLC:-node --conditions=source $REPO/packages/cli/src/main.ts}"
unset SDLC_PROJECT_DIR CLAUDE_PROJECT_DIR CURSOR_PROJECT_DIR SDLC_TGZ
# never reach a real Jira with the reader's credentials
unset JIRA_EMAIL JIRA_USER JIRA_API_TOKEN JIRA_PAT JIRA_BASE_URL
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
  files="$(printf '%s\n' "$out" | grep -o '[0-9]* agent files' || true)"
  [ -n "$files" ] && documented "$INSTALL" "$files" || ko "init: agent files count" "    not in the output: $out"
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

echo "connect Jira (against tests/docs/fake-jira.mjs)"
JIRA_EN=docs/start/jira.md; JIRA_ES=docs/es/empezar/jira.md
jboth() { shows "$1" "$2" "$3"; documented "$JIRA_EN" "$3"; documented "$JIRA_ES" "$3"; }
node "$REPO/tests/docs/fake-jira.mjs" > "$TMP/jira-port" & FAKE_JIRA=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TMP/jira-port" ] && break; sleep 0.5; done
if cd "$TMP/en/my-todo" 2>/dev/null && [ -s "$TMP/jira-port" ]; then
  out="$(npx sdlc tracker get PROJ-1 2>&1)"
  shows "jira: not configured" "$out" "tracker not configured (tracker.provider: jira | github | linear)"
  documented "$JIRA_EN" "tracker not configured (tracker.provider: jira \| github \| linear)"; documented "$JIRA_ES" "tracker not configured (tracker.provider: jira \| github \| linear)"
  node -e '
    const fs = require("fs"), f = ".sdlc/config.json", c = JSON.parse(fs.readFileSync(f, "utf8"));
    c.tracker = { provider: "jira", mode: "linkage", base_url: process.argv[1], project_key: "PROJ", default_issue_type: "Task", incident_issue_type: "Bug",
      transitions: { spec: "In Design", plan: "In Progress", ship: "In Review", merged: "Done" } };
    fs.writeFileSync(f, JSON.stringify(c, null, 2));' "http://127.0.0.1:$(cat "$TMP/jira-port")"
  out="$(npx sdlc doctor 2>&1)"; case "$out" in *✗*) ko "jira: config block passes doctor" "$out" ;; *) ok "jira: config block passes doctor" ;; esac
  out="$(npx sdlc tracker get PROJ-1 2>&1)"; jboth "jira: no credentials" "$out" "missing Jira credentials (JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT)"
  out="$(JIRA_EMAIL=ana@example.com JIRA_API_TOKEN=wrong npx sdlc tracker get PROJ-1 2>&1)"; shows "jira: wrong token" "$out" "HTTP 401"
  export JIRA_EMAIL=ana@example.com JIRA_API_TOKEN=test-token
  out="$(npx sdlc tracker get PROJ-9 2>&1)"; shows "jira: unknown ticket" "$out" "HTTP 404"
  out="$(npx sdlc tracker statuses 2>&1)"; jboth "jira: statuses" "$out" "$(printf 'Done\nIn Design\nIn Progress\nIn Review\nTo Do')"
  out="$(npx sdlc tracker get PROJ-1 2>&1)"
  jboth "jira: get" "$out" '{"key":"PROJ-1","summary":"Mark a to-do as done","status":"To Do","type":"Story","description":null,"url":"'
  out="$(npx sdlc tracker transitions PROJ-1 2>&1)"; jboth "jira: transitions" "$out" "$(printf 'In Design\t→ In Design\nIn Progress\t→ In Progress')"
  out="$(npx sdlc tracker transition PROJ-1 spec 2>&1)"; shows "jira: transition by stage" "$out" "PROJ-1 → In Design"
  out="$(npx sdlc tracker transition PROJ-1 spec 2>&1)"
  jboth "jira: transition not allowed" "$out" "transition 'In Design' is not available for PROJ-1 from its current status"
  out="$(npx sdlc tracker transition PROJ-1 merged 2>&1)"; shows "jira: merged" "$out" "PROJ-1 → Done"
  documented "$JIRA_EN" "PROJ-123 → Done"; documented "$JIRA_ES" "PROJ-123 → Done"
  unset JIRA_EMAIL JIRA_API_TOKEN
else
  ko "jira: fake server and repo" "    could not start tests/docs/fake-jira.mjs or find the tutorial repo"
fi
kill "$FAKE_JIRA" 2>/dev/null; wait "$FAKE_JIRA" 2>/dev/null
cd "$TMP"

# lines <name> <page> <output>: every line of the output is on the page (commit hashes normalised)
lines() {
  local missing="" l norm='s/\(([a-z ]*)[0-9a-f]{7}\)/(\1HASH)/'
  while IFS= read -r l; do
    [ -z "$l" ] && continue
    l="$(printf '%s' "$l" | sed -E "$norm")"
    sed -E "$norm" "$REPO/$2" | grep -qF -- "$l" || missing="$missing    $l"$'\n'
  done <<< "$3"
  [ -z "$missing" ] && ok "$1" || ko "$1" "    not on $2:"$'\n'"$missing"
}
# the example roadmap of the page goes where /sdlc-roadmap would write it
write_roadmap() {
  local f="changes/_roadmaps/$2/roadmap.md"
  { sed -n '1,/^---$/p' "$f" | head -n 1; sed -n '2,/^---$/p' "$f"; echo; awk '/^```markdown$/ { on = 1; next } on && /^```$/ { exit } on' "$REPO/$1"; } > "$TMP/roadmap.md"
  mv "$TMP/roadmap.md" "$f"
}
for loc in en es; do
  if [ "$loc" = es ]; then RM=docs/es/empezar/roadmap.md; RS=compartir-tareas; else RM=docs/start/roadmap.md; RS=todo-sharing; fi
  echo "from a technical plan to tickets ($loc, against tests/docs/fake-jira.mjs)"
  export DEMO_LOCALE="$loc"
  source "$REPO/scripts/media/tutorial.sh"
  tut_repo "$TMP/$loc/roadmap" || { ko "roadmap ($loc): repo" "could not prepare the repo"; continue; }
  loc_flag=(); [ "$loc" = es ] && loc_flag=(--locale es)
  npx sdlc init ${loc_flag[@]+"${loc_flag[@]}"} --preset solo --yes >/dev/null 2>&1 && git add -A && git commit -qm "chore: ai-sdlc"
  printf '%%PDF-1.4\n' > "$TMP/plan.pdf"
  F="changes/_roadmaps/$RS/roadmap.md"

  out="$(npx sdlc roadmap new "$RS" --source "$TMP/plan.pdf" 2>&1)"; lines "roadmap new" "$RM" "$out"
  write_roadmap "$RM" "$RS"
  sed -i.bak 's/^  A: .*/  A:/' "$F" && rm -f "$F.bak"
  out="$(npx sdlc roadmap check "$RS" 2>&1)"; shows "check: unanswered question" "$out" "✗ Q1 has no answer: "; documented "$RM" "| \`Q1 has no answer: …\` |"
  out="$(npx sdlc roadmap approve "$RS" 2>&1)"; shows "approve needs the check" "$out" "the roadmap does not pass the check; fix it first:"; documented "$RM" "the roadmap does not pass the check; fix it first:"
  write_roadmap "$RM" "$RS"
  out="$(npx sdlc roadmap check "$RS" 2>&1)"; lines "roadmap check" "$RM" "$out"
  git add changes/_roadmaps && git commit -qm "docs(roadmap): $RS"
  out="$(npx sdlc roadmap apply "$RS" 2>&1)"; shows "apply needs the approval" "$out" "is draft; a person approves it first (sdlc roadmap approve $RS)"; documented "$RM" "is draft; a person approves it first (sdlc roadmap approve $RS)"
  git config user.name Claude && git config user.email noreply@anthropic.com
  out="$(npx sdlc roadmap approve "$RS" 2>&1)"
  git config user.name "Ana Dev" && git config user.email ana@example.com
  shows "an agent cannot approve the roadmap" "$out" "looks like an agent or bot; a person must approve"; documented "$RM" "looks like an agent or bot; a person must approve"

  node "$REPO/tests/docs/fake-jira.mjs" > "$TMP/roadmap-port-$loc" & FAKE_JIRA=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TMP/roadmap-port-$loc" ] && break; sleep 0.5; done
  JURL="http://127.0.0.1:$(cat "$TMP/roadmap-port-$loc")"
  node -e '
    const fs = require("fs"), f = ".sdlc/config.json", c = JSON.parse(fs.readFileSync(f, "utf8"));
    c.tracker = { provider: "jira", mode: "linkage", base_url: process.argv[1], project_key: "PROJ", default_issue_type: "Task", incident_issue_type: "Bug" };
    fs.writeFileSync(f, JSON.stringify(c, null, 2));' "$JURL"
  git commit -qam "chore: connect Jira"
  export JIRA_EMAIL=ana@example.com JIRA_API_TOKEN=test-token
  out="$(npx sdlc roadmap approve "$RS" 2>&1)"; lines "roadmap approve" "$RM" "$out"
  out="$(npx sdlc roadmap apply "$RS" --dry-run 2>&1)"; lines "apply --dry-run" "$RM" "$out"
  out="$(npx sdlc roadmap apply "$RS" 2>&1)"; lines "apply" "$RM" "$out"
  out="$(npx sdlc roadmap apply "$RS" 2>&1)"; lines "apply again" "$RM" "$out"
  out="$(curl -s "$JURL/_created" | node -e 'const { created, links } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    console.log(created.map((c) => `${c.key} ${c.type} ${c.parent ?? "-"}`).join(", ") + " | " + links.join(", "))')"
  shows "jira got epics, stories under them and links" "$out" "PROJ-2 Epic -, PROJ-3 Task PROJ-2, PROJ-4 Task PROJ-2, PROJ-5 Epic -, PROJ-6 Task PROJ-5, PROJ-7 Task PROJ-5 | PROJ-3 blocks PROJ-4, PROJ-3 blocks PROJ-6, PROJ-6 blocks PROJ-7"
  out="$(npx sdlc next 2>&1)"; lines "next: first story" "$RM" "$out"
  out="$(npx sdlc roadmap status 2>&1)"; lines "roadmap status" "$RM" "$out"
  echo "- [ ] one more" >> "$F"
  out="$(npx sdlc roadmap apply "$RS" 2>&1)"; shows "an edit needs a new approval" "$out" "changed after it was approved; approve it again (sdlc roadmap approve $RS)"; documented "$RM" "changed after it was approved; approve it again (sdlc roadmap approve $RS)"
  git checkout -q -- "$F"
  node -e 'const fs = require("fs"), c = JSON.parse(fs.readFileSync(".sdlc/config.json", "utf8")); c.tracker.provider = "none"; fs.writeFileSync(".sdlc/config.json", JSON.stringify(c, null, 2));'
  out="$(npx sdlc roadmap apply "$RS" 2>&1)"; shows "apply without a tracker" "$out" "tracker not configured (tracker.provider: jira | github | linear)"
  git checkout -q -- .sdlc/config.json
  unset JIRA_EMAIL JIRA_API_TOKEN
  kill "$FAKE_JIRA" 2>/dev/null; wait "$FAKE_JIRA" 2>/dev/null
  cd "$TMP"
done
documented docs/start/roadmap.md "tracker not configured (tracker.provider: jira \| github \| linear)"; documented docs/es/empezar/roadmap.md "tracker not configured (tracker.provider: jira \| github \| linear)"

echo "same pages in both languages"
pairs="what-is-it:que-es install:instalar tutorial:tutorial daily:dia-a-dia jira:jira roadmap:roadmap troubleshooting:problemas"
for p in $pairs; do
  en="docs/start/${p%%:*}.md"; es="docs/es/empezar/${p##*:}.md"
  [ -f "$REPO/$en" ] && [ -f "$REPO/$es" ] || { ko "$en / $es exist" ""; continue; }
  a="$(grep -c '^##' "$REPO/$en")"; b="$(grep -c '^##' "$REPO/$es")"
  [ "$a" = "$b" ] && ok "$en and $es have $a headings" || ko "$en and $es have the same headings" "    en: $a, es: $b"
  # images are relative (they also render on GitHub); the video is served from docs/public
  for m in $(grep -o 'media/[a-z-]*-en\.[a-z0-9]*' "$REPO/$en" | sort -u); do
    case "$m" in *.mp4|*.vtt) f="$REPO/docs/public/$m" ;; *) f="$REPO/docs/$m" ;; esac
    fes="${f/-en./-es.}"
    [ -f "$f" ] && [ -f "$fes" ] && grep -q "${m/-en./-es.}" "$REPO/$es" && ok "$m in both" || ko "$m in both" "    missing file or not used in $es"
  done
done
for link in /start/what-is-it /start/install /start/tutorial /start/daily /start/jira /start/roadmap /start/troubleshooting /es/empezar/que-es /es/empezar/instalar /es/empezar/tutorial /es/empezar/dia-a-dia /es/empezar/jira /es/empezar/roadmap /es/empezar/problemas /es/integraciones/trackers /es/integraciones/ci-github /es/integraciones/ci-gitlab /es/integraciones/ci-bitbucket; do
  grep -q "link: '$link'" "$REPO/docs/.vitepress/config.mts" && ok "sidebar: $link" || ko "sidebar: $link" ""
done

# GitHub renders docs/ too: internal links must be relative paths to real files (`./install.md`, not `/start/install`)
unresolved_links() {
  find docs -name '*.md' -not -path '*/node_modules/*' -not -path '*/.vitepress/*' | while read -r f; do
    grep -o '](\([^)[:space:]]*\))' "$f" | sed -E 's/^\]\((.*)\)$/\1/' | while read -r t; do
      case "$t" in
        http:*|https:*|mailto:*|'#'*) ;;
        /*) echo "    $f: $t" ;;
        *) [ -f "$(dirname "$f")/${t%%#*}" ] || echo "    $f: $t" ;;
      esac
    done
  done
}
bad=$(cd "$REPO" && unresolved_links)
[ -z "$bad" ] && ok "docs links resolve as files (GitHub)" || ko "docs links resolve as files (GitHub)" "$bad"

# `#anchor` links must match the heading on the site and on GitHub, which slug differently: VitePress drops accents
# and prefixes a leading digit with `_` ("## 4. Check" → `_4-check`), GitHub keeps both (`4-check`, `creá`)
bad=$(cd "$REPO" && node -e '
const fs = require("fs"), path = require("path");
const vp = (h) => { const s = h.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"\x27“”‘’<>,.?/]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase(); return /^\d/.test(s) ? "_" + s : s; };
const gh = (h) => h.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
const read = (f) => fs.readFileSync(f, "utf8").replace(/<!--@include: ([^{}]+?)(\{[^}]*\})?-->/g, (_, p) => read(path.join(path.dirname(f), p)));
const heads = (f) => read(f).replace(/```[\s\S]*?```/g, "").split("\n").filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#+ /, "").replace(/`/g, "").trim());
for (const f of process.argv.slice(1)) {
  for (const [, file, anchor] of fs.readFileSync(f, "utf8").matchAll(/\]\(([^)#\s]*)#([^)\s]+)\)/g)) {
    if (/^https?:/.test(file)) continue;
    const target = file ? path.join(path.dirname(f), file) : f;
    if (!fs.existsSync(target)) continue;
    if (!heads(target).some((h) => vp(h) === anchor && gh(h) === anchor)) console.log(`    ${f}: ${file}#${anchor}`);
  }
}' $(find docs -name '*.md' -not -path '*/node_modules/*' -not -path '*/.vitepress/*'))
[ -z "$bad" ] && ok "docs #anchors match on the site and on GitHub" || ko "docs #anchors match on the site and on GitHub" "$bad"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = 0 ]
