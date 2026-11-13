import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { gitIn, repo } from '../../core/test/helpers.ts';

const base = mkdtempSync(join(tmpdir(), 'sdlc-server-discovery-'));
process.env.XDG_CONFIG_HOME = join(base, 'config');
process.env.SDLC_UI_DIR = join(base, 'no-ui');
for (const k of ['JIRA_EMAIL', 'JIRA_USER', 'JIRA_API_TOKEN', 'JIRA_PAT', 'JIRA_BASE_URL', 'SDLC_CI_AGENT', 'SDLC_CI_MODEL']) delete process.env[k];

// A stand-in for `claude -p`: writes one topic citing the registered source and commits the discovery folder.
const bin = join(base, 'bin');
mkdirSync(bin);
writeFileSync(
  join(bin, 'claude'),
  `#!/usr/bin/env node
const fs = require('fs'), { execFileSync } = require('child_process');
if (process.argv.includes('--version')) process.exit(0);
const prompt = process.argv.find((a) => /sdlc-discovery/.test(a));
const label = /registered as "([^"]+)"/.exec(prompt)[1];
fs.mkdirSync('changes/_discovery/topics', { recursive: true });
fs.writeFileSync('changes/_discovery/topics/photos.md', '---\\ntopic: photos\\ntitle: Photos\\ncreated: 2026-09-14\\n---\\n# Photos\\n\\n## Features\\n| ID | Feature | Status | Repo | Ticket | Blocked by | Evidence |\\n|---|---|---|---|---|---|---|\\n| F1 | Attach photos | requested | missing | no ticket | | ' + label + ' · Dana: "photos" |\\n\\n## Changes\\n- ' + label + ': F1 added\\n');
execFileSync('git', ['add', '--', 'changes/_discovery']);
execFileSync('git', ['commit', '-qm', 'discovery: ' + label]);
console.log('merged ' + label);
`,
);
chmodSync(join(bin, 'claude'), 0o755);
process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;

const { createApp } = await import('@ai-native-sdlc/server');

const TOKEN = 'a'.repeat(32);
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('host', '127.0.0.1');
  headers.set('x-sdlc-token', TOKEN);
  if (typeof init.body === 'string') headers.set('content-type', 'application/json');
  return app.request(`http://127.0.0.1${path}`, { ...init, headers });
};
const upload = (app: App, fields: Record<string, string | File>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return call(app, '/api/discovery/sources', { method: 'POST', body: form });
};
async function settle(app: App, id: string) {
  for (let i = 0; i < 100; i++) {
    const job = await (await call(app, `/api/jobs/${id}`)).json();
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`job ${id} still running`);
}

test('dashboard discovery: upload a transcript, the agent merges it, the state shows it; duplicates are refused', async () => {
  const root = repo({ version: 1, locale: 'en' });
  const app = createApp({ root, token: TOKEN });
  const empty = await (await call(app, '/api/discovery')).json();
  assert.equal(empty.started, false);
  assert.equal(empty.dir, 'changes/_discovery');

  const vtt = new File(['WEBVTT\n\n00:01.000 --> 00:02.000\n<v Dana>We need photos\n'], 'weekly 2026-09-14.vtt');
  assert.equal((await upload(app, { file: vtt })).status, 400, 'the meeting needs a name');
  assert.equal((await upload(app, { file: new File(['x'], 'notes.docx'), name: 'Weekly' })).status, 400);
  const res = await upload(app, { file: vtt, name: 'Weekly sync' });
  assert.equal(res.status, 201, await res.clone().text());
  const { source, job } = await res.json();
  assert.equal(source.label, '2026-09-14 Weekly sync', 'the date comes from the file name');
  assert.equal(job.kind, 'discovery');
  const done = await settle(app, job.id);
  assert.equal(done.status, 'done', done.error);

  const state = await (await call(app, '/api/discovery')).json();
  assert.equal(state.started, true);
  assert.deepEqual(state.errors, []);
  assert.deepEqual(state.status.todo.map((i: { ref: string }) => i.ref), ['photos#F1']);
  assert.deepEqual(state.sources.map((s: { label: string }) => s.label), ['2026-09-14 Weekly sync']);
  assert.equal(state.job.id, job.id);
  assert.match(gitIn(root, 'log', '-1', '--format=%s'), /^discovery: 2026-09-14 Weekly sync$/);

  const dup = await upload(app, { file: vtt, name: 'Again' });
  assert.equal(dup.status, 409);
  assert.match((await dup.json()).error, /already processed as '2026-09-14 Weekly sync'/);
  const older = await upload(app, { file: new File(['earlier'], 'kickoff.md'), name: 'Kickoff', date: '2026-09-01', agent: 'false' });
  assert.equal(older.status, 409);
  assert.equal((await older.json()).olderThan, '2026-09-14 Weekly sync');
  assert.equal((await upload(app, { file: new File(['earlier'], 'kickoff.md'), name: 'Kickoff', date: '2026-09-01', agent: 'false', force: 'true' })).status, 201);
});

test('dashboard discovery: seed the baseline without a tracker', async () => {
  const root = repo({ version: 1, locale: 'en' });
  gitIn(root, 'checkout', '-qb', 'spike/x');
  writeFileSync(join(root, 'x.ts'), 'x');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'try x');
  gitIn(root, 'checkout', '-q', 'main');
  const app = createApp({ root, token: TOKEN });
  const r = await (await call(app, '/api/discovery/seed', { method: 'POST', body: JSON.stringify({}) })).json();
  assert.deepEqual(r.added, ['F1']);
  assert.match(r.warnings.join('\n'), /no tracker configured/);
  assert.match(readFileSync(join(root, 'changes/_discovery/topics/_baseline.md'), 'utf8'), /\| F1 \| try x \| in progress \| partial \| no ticket \|/);
});
