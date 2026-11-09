import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { gitIn, repo } from '../../core/test/helpers.ts';

const base = mkdtempSync(join(tmpdir(), 'sdlc-server-roadmaps-'));
process.env.XDG_CONFIG_HOME = join(base, 'config');
process.env.SDLC_UI_DIR = join(base, 'no-ui');
for (const k of ['JIRA_EMAIL', 'JIRA_USER', 'JIRA_API_TOKEN', 'JIRA_PAT', 'JIRA_BASE_URL', 'SDLC_CI_AGENT', 'SDLC_CI_MODEL']) delete process.env[k];

// A stand-in for `claude -p` and `cursor-agent -p`: drafts the roadmap from the prompt (one open question), refines it once the question
// is answered, and commits. STUB_FAIL makes it exit 2; STUB_SLEEP keeps it busy.
const bin = join(base, 'bin');
mkdirSync(bin);
writeFileSync(
  join(bin, 'claude'),
  `#!/usr/bin/env node
const fs = require('fs'), { execFileSync } = require('child_process');
if (process.argv.includes('--version')) process.exit(0);
const prompt = process.argv.find((a) => / the roadmap /.test(a));
process.stderr.write(require('path').basename(process.argv[1]) + '\\n');
if (process.env.STUB_FAIL) { process.stderr.write('model overloaded\\n'); process.exit(2); }
const slug = /the roadmap ([a-z0-9-]+)/.exec(prompt)[1];
const f = 'changes/_roadmaps/' + slug + '/roadmap.md';
const raw = fs.readFileSync(f, 'utf8');
const head = raw.slice(0, raw.indexOf('\\n---', 4) + 5);
process.stderr.write('reading ' + fs.readdirSync('changes/_roadmaps/' + slug).join(' ') + '\\n');
const story = (id, title, dep) => '### ' + id + ' · ' + title + '\\n- risk: low\\n- depends: ' + dep + '\\n- source: §2\\n\\nAcceptance criteria:\\n- [ ] it works\\n\\n';
const answered = /^  A: (.+)$/m.exec(raw);
let body = '# Roadmap: Sharing\\n\\n## E1 · Sharing\\n\\n' + story('E1.S1', 'Export a list', '-');
if (/answered open questions/.test(prompt) && answered) body += story('E1.S2', 'Import a list', 'E1.S1') + '## Open questions\\n- Q1: Duplicates?\\n  A: ' + answered[1] + '\\n';
else body += '## Open questions\\n- Q1: Duplicates?\\n  A:\\n';
const done = () => {
  fs.writeFileSync(f, head + body);
  execFileSync('git', ['add', '--', 'changes/_roadmaps/' + slug]);
  execFileSync('git', ['commit', '-qm', 'docs(roadmap-' + slug + '): breakdown']);
  console.log('drafted ' + f);
};
setTimeout(done, Number(process.env.STUB_SLEEP ?? 0));
`,
);
chmodSync(join(bin, 'claude'), 0o755);
writeFileSync(join(bin, 'cursor-agent'), readFileSync(join(bin, 'claude')));
chmodSync(join(bin, 'cursor-agent'), 0o755);
process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;

const { createApp, jobEvents, readJobs } = await import('@ai-native-sdlc/server');

const TOKEN = 'a'.repeat(32);
type App = ReturnType<typeof createApp>;
const call = (app: App, path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('host', '127.0.0.1');
  headers.set('x-sdlc-token', TOKEN);
  if (typeof init.body === 'string') headers.set('content-type', 'application/json');
  return app.request(`http://127.0.0.1${path}`, { ...init, headers });
};
const post = (app: App, path: string, body: object) => call(app, path, { method: 'POST', body: JSON.stringify(body) });
const upload = (app: App, fields: Record<string, string | File>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return call(app, '/api/roadmaps', { method: 'POST', body: form });
};
async function settle(app: App, id: string) {
  for (let i = 0; i < 100; i++) {
    const job = await (await call(app, `/api/jobs/${id}`)).json();
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`job ${id} still running`);
}
const setup = (config: object = {}) => {
  const root = repo({ version: 1, locale: 'en', ...config });
  return { root, app: createApp({ root, token: TOKEN }) };
};

test('roadmaps: upload → the agent drafts → answers → the agent refines → approve → preview → create', async () => {
  const { root, app } = setup();
  const events: string[] = [];
  const onJob = (r: string, j: { kind: string; status: string }) => r === root && events.push(`${j.kind}:${j.status}`);
  jobEvents.on('job', onJob);

  const res = await upload(app, { slug: 'sharing', title: 'To-do sharing', file: new File(['# Plan\n\n## 2. Sharing\n'], 'plan.md') });
  assert.equal(res.status, 201, await res.clone().text());
  const created = await res.json();
  assert.equal(created.source, 'changes/_roadmaps/sharing/source.md');
  assert.equal(created.job.status, 'running');
  assert.equal(created.job.kind, 'draft');
  assert.match(readFileSync(join(root, '.sdlc/jobs', `${created.job.id}.json`), 'utf8'), /"status": "running"/);

  const draft = await settle(app, created.job.id);
  assert.equal(draft.status, 'done', draft.error + draft.log);
  assert.match(draft.log, /reading roadmap\.md source\.md/, 'the agent sees the uploaded document');
  assert.match(draft.answer, /drafted changes\/_roadmaps\/sharing\/roadmap\.md/);

  let detail = await (await call(app, '/api/roadmaps/sharing')).json();
  assert.equal(detail.status, 'draft');
  assert.equal(detail.title, 'Sharing');
  assert.equal(detail.stories, 1);
  assert.equal(detail.open, 1);
  assert.deepEqual(detail.questions, [{ id: 'Q1', text: 'Duplicates?' }]);
  assert.match(detail.errors.join('\n'), /Q1 has no answer/);
  assert.deepEqual(detail.canDecide, { ok: true });
  assert.equal(detail.holds.ok, false);
  assert.equal(detail.tracker, undefined);
  assert.equal(detail.job.id, created.job.id);
  assert.deepEqual(detail.tree.map((i: { id: string }) => i.id), ['E1', 'E1.S1']);

  const early = await post(app, '/api/roadmaps/sharing/gate', { decision: 'approved' });
  assert.equal(early.status, 400);
  assert.match((await early.json()).error, /does not pass the check/);

  const answered = await (await post(app, '/api/roadmaps/sharing/answers', { answers: { Q1: 'Yes, skip it.' } })).json();
  assert.equal(answered.changed, true);
  assert.equal(answered.open, 0);
  assert.equal(answered.job.kind, 'refine');
  assert.match(gitIn(root, 'log', '-3', '--format=%s'), /docs\(roadmap-sharing\): answer open questions/);
  assert.equal((await settle(app, answered.job.id)).status, 'done');
  detail = await (await call(app, '/api/roadmaps/sharing')).json();
  assert.equal(detail.stories, 2, 'the agent updated the breakdown with the answer');
  assert.deepEqual(detail.errors, []);
  assert.equal(detail.questions[0].answer, 'Yes, skip it.');
  const same = await (await post(app, '/api/roadmaps/sharing/answers', { answers: { Q1: 'Yes, skip it.' } })).json();
  assert.equal(same.changed, false);
  assert.equal(same.job, undefined, 'no rerun when nothing changed');

  const list = await (await call(app, '/api/roadmaps')).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].slug, 'sharing');
  assert.equal(list[0].job.kind, 'refine');

  const notYet = await post(app, '/api/roadmaps/sharing/apply', { dryRun: true });
  assert.equal(notYet.status, 400);
  assert.match((await notYet.json()).error, /is draft; a person approves it first/);

  const approved = await (await post(app, '/api/roadmaps/sharing/gate', { decision: 'approved', comment: 'go' })).json();
  assert.equal(approved.decision, 'approved');
  assert.match(gitIn(root, 'log', '-1', '--format=%B'), /Gate: roadmap approved by Ana Product/);

  const preview = await (await post(app, '/api/roadmaps/sharing/apply', { dryRun: true })).json();
  assert.equal(preview.dryRun, true);
  assert.deepEqual(preview.actions.map((a: { kind: string }) => a.kind), ['create-epic', 'create-story', 'create-story', 'link']);
  const noTracker = await post(app, '/api/roadmaps/sharing/apply', {});
  assert.equal(noTracker.status, 400);
  assert.match((await noTracker.json()).error, /tracker not configured/);

  // a stub Jira: issues get PROJ-n, links are accepted
  let n = 0;
  const jira = createServer((req, res) => {
    req.resume().on('end', () => {
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(req.url === '/rest/api/2/issue' ? JSON.stringify({ key: `PROJ-${++n}` }) : '');
    });
  });
  await new Promise<void>((r) => jira.listen(0, '127.0.0.1', r));
  try {
    const cfg = JSON.parse(readFileSync(join(root, '.sdlc/config.json'), 'utf8'));
    cfg.tracker = { provider: 'jira', base_url: `http://127.0.0.1:${(jira.address() as AddressInfo).port}`, project_key: 'PROJ' };
    writeFileSync(join(root, '.sdlc/config.json'), JSON.stringify(cfg));
    process.env.JIRA_EMAIL = 'ana@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';
    const applied = await post(app, '/api/roadmaps/sharing/apply', {});
    assert.equal(applied.status, 200, await applied.clone().text());
    const r = await applied.json();
    assert.equal(r.created, 3);
    assert.equal(r.linked, 1);
    detail = await (await call(app, '/api/roadmaps/sharing')).json();
    assert.equal(detail.tickets, 3);
    assert.equal(detail.tracker, 'jira');
    assert.deepEqual(detail.progress.map((s: { key?: string }) => s.key), ['PROJ-2', 'PROJ-3']);
  } finally {
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
    jira.close();
  }

  jobEvents.off('job', onJob);
  assert.deepEqual([...new Set(events)], ['draft:running', 'draft:done', 'refine:running', 'refine:done'], 'progress reaches /api/stream');
});

test('roadmaps: a Cursor project drafts with cursor-agent, and the dashboard says so', async () => {
  const { app } = setup({ agents: ['cursor', 'agents-md'] });
  assert.deepEqual(await (await call(app, '/api/agent')).json(), { agent: 'cursor', bin: 'cursor-agent', installed: true });
  const res = await upload(app, { slug: 'cursor-plan', file: new File(['# Plan\n'], 'plan.md') });
  assert.equal(res.status, 201, await res.clone().text());
  const created = await res.json();
  assert.equal(created.job.agent, 'cursor');
  const job = await settle(app, created.job.id);
  assert.equal(job.status, 'done', job.error + job.log);
  assert.match(job.log, /^cursor-agent$/m);

  const pinned = setup({ agents: ['cursor'], ci: { agent: 'claude' } });
  assert.equal((await (await call(pinned.app, '/api/agent')).json()).agent, 'claude', 'ci.agent wins');
});

test('roadmaps: uploads are validated (type, size, slug, link)', async () => {
  const { root, app } = setup();
  const bad = async (fields: Record<string, string | File>, status: number, error: RegExp) => {
    const res = await upload(app, fields);
    assert.equal(res.status, status, await res.clone().text());
    assert.match((await res.json()).error, error);
  };
  await bad({ slug: 'a', file: new File(['x'], 'plan.docx') }, 400, /unsupported document plan\.docx: use \.pdf/);
  await bad({ slug: 'a' }, 400, /upload the technical plan/);
  await bad({ slug: 'a', url: 'file:///etc/passwd' }, 400, /must start with http/);
  await bad({ slug: 'Not Valid', file: new File(['x'], 'plan.md'), agent: 'false' }, 400, /invalid slug/);
  await bad({ slug: 'big', file: new File([new Uint8Array(21 * 1024 * 1024)], 'plan.pdf') }, 413, /larger than 20 MB/);
  assert.equal(existsSync(join(root, 'changes/_roadmaps/big')), false);

  await bad({ slug: 'a', url: 'https://example.com/plan' }, 400, /reads Google Docs links/);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: string) =>
    String(u).includes('/d/private/') ? new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }) : new Response('# Plan\n', { headers: { 'content-type': 'text/x-markdown' } })) as typeof fetch;
  try {
    await bad({ slug: 'secret', url: 'https://docs.google.com/document/d/private/edit', agent: 'false' }, 400, /Anyone with the link/);
    assert.equal(existsSync(join(root, 'changes/_roadmaps/secret')), false, 'nothing is left behind');
    const linked = await upload(app, { slug: 'from-doc', url: 'https://docs.google.com/document/d/abc/edit', agent: 'false' });
    assert.equal(linked.status, 201);
    const body = await linked.json();
    assert.equal(body.source, 'changes/_roadmaps/from-doc/source.md');
    assert.equal(readFileSync(join(root, body.source), 'utf8'), '# Plan\n');
    assert.equal(body.job, undefined, 'agent=false only scaffolds');
    await bad({ slug: 'from-doc', url: 'https://docs.google.com/document/d/abc', agent: 'false' }, 400, /already exists/);
  } finally {
    globalThis.fetch = realFetch;
  }

  // every route takes the slug from the URL: no way out of changes/_roadmaps/<slug>/
  const sneaky = encodeURIComponent('x/../../_roadmaps/from-doc');
  assert.notEqual((await call(app, `/api/roadmaps/${sneaky}`)).status, 200);
  const write = await post(app, `/api/roadmaps/${sneaky}/answers`, { answers: { Q1: 'pwned' }, rerun: false });
  assert.equal(write.status, 400);
  assert.match((await write.json()).error, /invalid roadmap/);
  assert.doesNotMatch(readFileSync(join(root, 'changes/_roadmaps/from-doc/roadmap.md'), 'utf8'), /pwned/);
});

test('roadmaps: one agent run per roadmap; failures and interrupted runs are reported', async () => {
  const { root, app } = setup();
  process.env.STUB_SLEEP = '1500';
  try {
    const { job } = await (await upload(app, { slug: 'busy', file: new File(['# Plan'], 'plan.txt') })).json();
    const gate = await post(app, '/api/roadmaps/busy/gate', { decision: 'approved' });
    assert.equal(gate.status, 400);
    assert.match((await gate.json()).error, /still working on busy/);
    const answers = await post(app, '/api/roadmaps/busy/answers', { answers: { Q1: 'x' } });
    assert.match((await answers.json()).error, /still working on busy/);
    await settle(app, job.id);
  } finally {
    delete process.env.STUB_SLEEP;
  }

  process.env.STUB_FAIL = '1';
  try {
    const { job } = await (await upload(app, { slug: 'broken', file: new File(['# Plan'], 'plan.md') })).json();
    const failed = await settle(app, job.id);
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /claude exited with 2/);
    assert.match(failed.log, /model overloaded/);
  } finally {
    delete process.env.STUB_FAIL;
  }

  writeFileSync(join(root, '.sdlc/jobs/old.json'), JSON.stringify({ id: 'old', kind: 'draft', roadmap: 'busy', agent: 'claude', status: 'running', started: '2026-01-01T00:00:00.000Z', log: '', pid: -1 }));
  const old = readJobs(root).find((j) => j.id === 'old')!;
  assert.equal(old.status, 'failed');
  assert.match(old.error!, /interrupted/);
  assert.equal((await call(app, '/api/jobs/nope')).status, 404);
  assert.equal((await call(app, '/api/roadmaps/nope')).status, 404);
  assert.match(gitIn(root, 'check-ignore', '.sdlc/jobs/old.json'), /old\.json/, 'jobs stay out of git');
});
