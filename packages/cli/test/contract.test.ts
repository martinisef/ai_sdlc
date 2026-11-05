// The 1.x contract (docs/reference/stability.md): help text, config schema and the keys of the --json outputs.
// After an intended change, regenerate with UPDATE_SNAPSHOTS=1 and review the diff: a removed or renamed key is a major change.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { commitAll, project, REPO, sdlc } from './helpers.ts';

const SNAPS = join(REPO, 'packages/cli/test/snapshots');
const UPDATE = !!process.env.UPDATE_SNAPSHOTS;
const ENV = { JIRA_EMAIL: undefined, JIRA_API_TOKEN: undefined, SDLC_TELEMETRY: '0' };

function snapshot(name: string, actual: string) {
  const file = join(SNAPS, name);
  if (UPDATE || !existsSync(file)) {
    mkdirSync(SNAPS, { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  assert.equal(actual, readFileSync(file, 'utf8'), `${name} changed; if intended, run UPDATE_SNAPSHOTS=1 npm test and review the diff`);
}

/** Every key path in a JSON value; arrays contribute the keys of all their elements under `[]`. */
function keyPaths(v: unknown, prefix = ''): string[] {
  if (Array.isArray(v)) return [...new Set(v.flatMap((x) => keyPaths(x, `${prefix}[]`)))];
  if (v && typeof v === 'object')
    return Object.entries(v).flatMap(([k, x]) => [`${prefix}${prefix ? '.' : ''}${k}`, ...keyPaths(x, `${prefix}${prefix ? '.' : ''}${k}`)]);
  return [];
}

function keysContract(name: string, out: string, lines = false) {
  const value = lines ? out.split('\n').map((l) => JSON.parse(l)) : JSON.parse(out);
  const actual = [...new Set(keyPaths(value))].sort();
  const file = join(SNAPS, name);
  if (UPDATE || !existsSync(file)) {
    mkdirSync(SNAPS, { recursive: true });
    writeFileSync(file, JSON.stringify(actual, null, 2) + '\n');
    return;
  }
  const expected: string[] = JSON.parse(readFileSync(file, 'utf8'));
  const missing = expected.filter((k) => !actual.includes(k));
  assert.deepEqual(missing, [], `${name}: keys removed from the --json output (a breaking change)`);
}

const ROADMAP = `---
roadmap: demo
status: draft
author: Ana Dev
---
# Roadmap: Demo

## E1 · Sharing

### E1.S1 · Share a list by link
- risk: medium
- depends: E1.S2

Acceptance criteria:
- [ ] A shared link opens the list read-only

### E1.S2 · List ids
- risk: low

Acceptance criteria:
- [ ] Every list has a stable id

## Open questions
- Q1: Can shared lists be edited?
  A: Not in v1.
`;

let root = '';
before(async () => {
  root = project({ preset: 'solo', locale: 'en' });
  for (const slug of ['add-login', 'export-csv']) {
    const r = await sdlc(root, ['new', slug], ENV);
    assert.equal(r.code, 0, r.err);
  }
  mkdirSync(join(root, 'changes/_roadmaps/demo'), { recursive: true });
  writeFileSync(join(root, 'changes/_roadmaps/demo/roadmap.md'), ROADMAP);
  commitAll(root, 'fixtures');
});

test('sdlc --help', async () => {
  const r = await sdlc(root, ['--help'], ENV);
  assert.equal(r.code, 0);
  snapshot('help.txt', r.out.replace(/^sdlc \S+/, 'sdlc <version>') + '\n');
});

for (const cmd of ['roadmap', 'ci', 'tracker', 'vcs']) {
  test(`sdlc ${cmd} --help`, async () => {
    const r = await sdlc(root, [cmd, '--help'], ENV);
    snapshot(`help-${cmd}.txt`, r.out + '\n');
  });
}

test('sdlc schema', async () => {
  const r = await sdlc(root, ['schema'], ENV);
  assert.equal(r.code, 0, r.err);
  snapshot('schema.json', r.out + '\n');
});

test('every command in --help is in the CLI reference', async () => {
  const help = (await sdlc(root, ['--help'], ENV)).out;
  const cmds = [...help.matchAll(/^ {2}([a-z][a-z-]*)(?=[ \n])/gm)].map((m) => m[1]);
  assert.ok(cmds.length > 20, `parsed only ${cmds.length} commands`);
  const doc = readFileSync(join(REPO, 'docs/reference/cli.md'), 'utf8');
  const missing = [...new Set(cmds)].filter((c) => !doc.includes(`sdlc ${c}`));
  assert.deepEqual(missing, [], 'commands missing from docs/reference/cli.md');
});

test('sdlc status --json prints one object per change (JSON Lines)', async () => {
  const r = await sdlc(root, ['status', '--json'], ENV);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.split('\n').length, 2);
  keysContract('json-status.json', r.out, true);
});

const JSON_CMDS: [string, string[]][] = [
  ['next', ['next', '--json']],
  ['doctor', ['doctor', '--json']],
  ['risk', ['risk', '--json']],
  ['roadmap-check', ['roadmap', 'check', 'demo', '--json']],
  ['roadmap-status', ['roadmap', 'status', 'demo', '--json']],
];
for (const [name, args] of JSON_CMDS) {
  test(`sdlc ${args.join(' ')} keeps its keys`, async () => {
    const r = await sdlc(root, args, ENV);
    assert.ok(r.out.startsWith('{') || r.out.startsWith('['), `${args.join(' ')}: not JSON (exit ${r.code}): ${r.out}${r.err}`);
    keysContract(`json-${name}.json`, r.out);
  });
}
