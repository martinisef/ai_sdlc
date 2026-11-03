// Writes the VHS tapes for the tutorial recordings, one per segment and locale, into <out>/tapes.
// Every command typed on screen is the one the tutorial page shows; the hidden part prepares the repo state
// with scripts/media/tutorial.sh. Usage: node scripts/media/tapes.mjs <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MEDIA = import.meta.dirname;
const OUT = resolve(process.argv[2] ?? process.exit(console.error('usage: tapes.mjs <out-dir outside the checkout>') ?? 2));

const S = {
  en: {
    quickWhat: 'List shows how many to-dos there are', quickSlug: 'list-shows-how-many-to-dos-there-are',
    slug: 'mark-done', title: 'Mark a to-do as done', item: 'buy milk', go: 'go',
    agentNote: '# "agent" = your agent\'s chat (Claude Code or Cursor). Sped up here.',
    banner: { install: '1. Install', quick: '2. A small change: the quick lane', loop: '3. A real feature: the full loop', guardrail: '4. Code before the plan is blocked' },
    sneak: 'feat: code before the plan',
  },
  es: {
    quickWhat: 'La lista muestra cuántas tareas hay', quickSlug: 'la-lista-muestra-cuantas-tareas-hay',
    slug: 'marcar-hecha', title: 'Marcar una tarea como hecha', item: 'comprar leche', go: 'dale',
    agentNote: '# "agent" = el chat de tu agente (Claude Code o Cursor). Acelerado acá.',
    banner: { install: '1. Instalar', quick: '2. Un cambio chico: el carril rápido', loop: '3. Una funcionalidad de verdad: el loop completo', guardrail: '4. El código antes del plan se bloquea' },
    sneak: 'feat: código antes del plan',
  },
};

// Hidden setup per segment: the repo state the segment starts from.
const SETUP = {
  install: 'tut_repo "$W"',
  quick: 'tut_repo "$W" && tut_install',
  loop: 'tut_repo "$W" && tut_install && tut_quick',
  guardrail: 'tut_repo "$W" && tut_install && tut_quick && tut_loop plan && git init -q --bare ../origin.git && git remote add origin ../origin.git',
};

function setupScript(seg, loc, work) {
  const file = join(OUT, 'tapes', `${seg}-${loc}.sh`);
  // with a tarball the recording uses node_modules/.bin/sdlc, like a real install (no local paths on screen)
  const env = process.env.SDLC_TGZ ? `export SDLC_TGZ=${JSON.stringify(process.env.SDLC_TGZ)}\nunset SDLC_BIN` : `export SDLC_BIN=${JSON.stringify(process.env.SDLC_BIN ?? '')}`;
  writeFileSync(
    file,
    `${env}\nexport DEMO_LOCALE=${loc}\nW=${JSON.stringify(join(work, `${seg}-${loc}`, 'my-todo'))}\nmkdir -p "$(dirname "$W")"\n` +
      `source ${JSON.stringify(join(MEDIA, 'tutorial.sh'))}\n${SETUP[seg]} >/dev/null 2>&1 || echo "setup failed: ${seg}-${loc}"\n` +
      `PS1='\\[\\e[1;32m\\]my-todo\\[\\e[0m\\] $ '\nclear\n`,
  );
  return file;
}

const q = (s) => JSON.stringify(s); // VHS strings take JSON-style double quotes
const backtick = (s) => '`' + s.replaceAll('`', '') + '`'; // for typed text that contains double quotes

function tape(seg, loc, work) {
  const s = S[loc];
  const lines = [];
  // waits for the prompt to come back, then leaves `wait` to read the output
  const type = (text, wait = '1.5s') => lines.push(`Type ${text.includes('"') ? backtick(text) : q(text)}`, 'Enter', 'Wait@90s /my-todo \\$\\s*$/', `Sleep ${wait}`);
  const header = [
    `Output ${q(join(OUT, 'parts', `${seg}-${loc}.mp4`))}`,
    'Set Shell "bash"',
    'Set FontSize 18',
    'Set Width 1280',
    'Set Height 720',
    'Set Padding 24',
    'Set TypingSpeed 35ms',
    'Set Theme "Catppuccin Mocha"',
    'Set CursorBlink false',
    'Hide',
    `Type ${q(`source ${setupScript(seg, loc, work)}`)}`,
    'Enter',
    'Wait@60s /my-todo/',
    'Type "clear"',
    'Enter',
    'Sleep 300ms',
    'Show',
  ];
  type(`# ${s.banner[seg]}`, '1s');
  const init = loc === 'es' ? 'npx sdlc init --locale es --preset solo' : 'npx sdlc init --preset solo';
  if (seg === 'install') {
    type('node -v', '1s');
    type('npm test 2>&1 | grep pass', '2.5s');
    type('npm i -D @morsadev/sdlc', '6s');
    lines.push(`Type ${q(init)}`, 'Enter', 'Wait@30s /\\]:\\s*$/', 'Sleep 1.5s', 'Enter', 'Wait@60s /my-todo \\$\\s*$/', 'Sleep 4s'); // Enter accepts the suggested agent
    type('git add -A && git commit -qm "chore: ai-sdlc"', '3s');
    type('clear', '300ms');
    type('npx sdlc doctor | head -11', '5s');
  }
  if (seg === 'quick') {
    type(`npx sdlc quick "${s.quickWhat}"`, '3s');
    type(s.agentNote, '1s');
    type('agent /sdlc-quick', '4s');
    type(`node src/cli.js add "${s.item}"`, '1s');
    type('node src/cli.js list', '2s');
    type('npx sdlc quick --check', '2.5s');
    type(`git checkout main && git merge change/${s.quickSlug}`, '3s');
  }
  if (seg === 'loop') {
    type(`npx sdlc new ${s.slug} --title "${s.title}"`, '2.5s');
    type(s.agentNote, '1s');
    type('agent /sdlc-intent', '2s');
    type('npx sdlc next', '2.5s');
    type(`npx sdlc approve ${s.slug} intent -m "${s.go}"`, '2.5s');
    type('agent /sdlc-spec', '2s');
    type(`npx sdlc approve ${s.slug} spec`, '2.5s');
    type('clear', '300ms');
    type('agent /sdlc-plan', '2s');
    type('npx sdlc next', '2.5s');
    type(`npx sdlc approve ${s.slug} plan`, '2.5s');
    type('agent /sdlc-build', '4s');
    type(`node src/cli.js add "${s.item}" && node src/cli.js done 1 && node src/cli.js list`, '3s');
  }
  if (seg === 'guardrail') {
    type('npx sdlc next', '2.5s');
    type(`echo "// wip" >> src/todos.js && git commit -qam "${s.sneak}"`, '2s');
    type(`git push -u origin change/${s.slug}`, '6s');
  }
  lines.push('Sleep 2s');
  return [...header, ...lines].join('\n') + '\n';
}

mkdirSync(join(OUT, 'tapes'), { recursive: true });
mkdirSync(join(OUT, 'parts'), { recursive: true });
const work = join(OUT, 'work');
for (const loc of Object.keys(S))
  for (const seg of Object.keys(SETUP)) writeFileSync(join(OUT, 'tapes', `${seg}-${loc}.tape`), tape(seg, loc, work));
console.log(`tapes in ${join(OUT, 'tapes')}`);
