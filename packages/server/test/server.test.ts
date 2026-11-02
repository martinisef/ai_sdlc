import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { gitIn, repo, writeArtifact } from '../../core/test/helpers.ts';

// WORKSPACES_FILE and the UI dir are read from the environment, so both are set before the import.
const base = mkdtempSync(join(tmpdir(), 'sdlc-server-'));
process.env.XDG_CONFIG_HOME = join(base, 'config');
const ui = join(base, 'ui');
mkdirSync(ui);
writeFileSync(join(ui, 'index.html'), '<meta name="sdlc-token" content="__SDLC_TOKEN__">');
writeFileSync(join(ui, 'app.js'), 'console.log("app")');
mkdirSync(join(base, 'ui-evil'));
writeFileSync(join(base, 'ui-evil', 'x.js'), 'EVIL');
process.env.SDLC_UI_DIR = ui;

const { createApp, staticFile } = await import('@ai-native-sdlc/server');

const TOKEN = 'a'.repeat(32);
const CONFIG = {
  version: 1,
  locale: 'en',
  gates: { spec: ['po'] },
  roles: { po: ['ana@example.com'] },
  protected_paths: ['migrations/**'],
};

let root: string;
let app: ReturnType<typeof createApp>;

function seed(): string {
  const r = repo(CONFIG);
  writeArtifact(r, 'claims', 'intent', 'accepted');
  writeArtifact(r, 'claims', 'spec', 'draft');
  writeArtifact(r, 'export', 'intent', 'draft');
  gitIn(r, 'add', '-A');
  gitIn(r, 'commit', '-qm', 'changes');
  return r;
}

const req = (path: string, init: RequestInit & { host?: string; token?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  headers.set('host', init.host ?? '127.0.0.1:4319');
  if (init.token !== null) headers.set('x-sdlc-token', init.token ?? TOKEN);
  if (init.body) headers.set('content-type', 'application/json');
  return app.request(`http://127.0.0.1:4319${path}`, { ...init, headers });
};
const json = async (path: string, init?: Parameters<typeof req>[1]) => (await req(path, init)).json();

before(() => {
  root = seed();
  app = createApp({ root, token: TOKEN });
});

test('security: local Host only, token on every API call (header or query), known workspaces only', async () => {
  assert.equal((await req('/', { host: 'evil.example.com' })).status, 403, 'DNS rebinding guard');
  assert.equal((await req('/api/state', { host: 'evil.example.com' })).status, 403);
  for (const host of ['localhost:4319', '[::1]:4319']) assert.equal((await req('/api/state', { host })).status, 200, host);
  assert.equal((await req('/api/state', { token: null })).status, 401);
  assert.equal((await req('/api/state', { token: 'b'.repeat(32) })).status, 401);
  assert.equal((await req('/api/state', { token: 'short' })).status, 401, 'a token of another length does not throw');
  assert.equal((await req(`/api/state?token=${TOKEN}`, { token: null })).status, 200, 'query token, used by EventSource');
  const other = await req(`/api/state?ws=${encodeURIComponent(base)}`);
  assert.equal(other.status, 400);
  assert.match((await other.json()).error, /unknown workspace/);
});

test('static: the token is injected, files stay inside the UI directory', async () => {
  const index = await (await req('/', { token: null })).text();
  assert.match(index, new RegExp(TOKEN));
  assert.doesNotMatch(index, /__SDLC_TOKEN__/);
  assert.equal(await (await req('/app.js', { token: null })).text(), 'console.log("app")');
  assert.match(await (await req('/board', { token: null })).text(), /sdlc-token/, 'client routes fall back to index.html');
  for (const path of ['/../ui-evil/x.js', '/%2e%2e/ui-evil/x.js', '/..%2fui-evil%2fx.js', '/%2e%2e%2fui-evil%2fx.js']) {
    const body = await (await req(path, { token: null })).text();
    assert.doesNotMatch(body, /EVIL/, path);
  }
});

test('staticFile: paths that resolve outside the UI directory fall back to index.html', () => {
  const index = join(ui, 'index.html');
  assert.equal(staticFile(ui, '/app.js'), join(ui, 'app.js'));
  assert.equal(staticFile(ui, '/'), index);
  assert.equal(staticFile(ui, '/board'), index, 'client route');
  assert.equal(staticFile(ui, '/missing.js'), index);
  assert.equal(staticFile(ui, '/../ui-evil/x.js'), index, 'sibling directory sharing the prefix');
  assert.equal(staticFile(ui, '/../../etc/hosts'), index);
});

test('static: without a built UI the page says how to build it', async () => {
  const saved = process.env.SDLC_UI_DIR;
  process.env.SDLC_UI_DIR = join(base, 'missing');
  try {
    const bare = createApp({ root, token: TOKEN });
    const res = await bare.request('http://127.0.0.1:4319/', { headers: { host: '127.0.0.1' } });
    // after `npm run build` the bundled ui/dist is the next candidate; without it the hint is served
    assert.equal(res.status, 200);
    assert.match(await res.text(), /UI not built|<html/i);
  } finally {
    process.env.SDLC_UI_DIR = saved;
  }
});

test('read: state, changes, change detail, metrics and events', async () => {
  const state = await json('/api/state');
  assert.equal(state.configured, true);
  assert.equal(state.locale, 'en');
  assert.equal(state.user.email, 'ana@example.com');
  assert.equal(state.next.kind, 'approve');

  const changes: { dir: string; column: string; waitingFor?: string; canDecide?: { ok: boolean } }[] = await json('/api/changes');
  const claims = changes.find((c) => c.dir === 'claims')!;
  assert.equal(claims.column, 'spec');
  assert.equal(claims.waitingFor, 'spec');
  assert.deepEqual(claims.canDecide, { ok: true });
  assert.equal(changes.find((c) => c.dir === 'export')!.column, 'intent');

  const detail = await json(`/api/changes/${claims.dir}`);
  assert.equal(detail.gates.spec.ok, true);
  assert.ok(detail.artifacts.spec.body !== undefined || detail.artifacts.spec.path);
  assert.ok(detail.timeline.some((t: { subject: string }) => t.subject === 'changes'));
  assert.equal((await req('/api/changes/nope')).status, 404);

  const metrics = await json('/api/metrics');
  assert.equal(typeof metrics, 'object');
  assert.ok(Array.isArray(await json('/api/events')));
});

test('write: gate decisions change the artifact; unknown artifacts are rejected', async () => {
  const r = seed();
  const local = createApp({ root: r, token: TOKEN });
  const post = (path: string, body: object) =>
    local.request(`http://127.0.0.1${path}`, { method: 'POST', body: JSON.stringify(body), headers: { host: '127.0.0.1', 'x-sdlc-token': TOKEN, 'content-type': 'application/json' } });
  const id = 'claims';

  const bad = await post(`/api/changes/${id}/gates/design`, { decision: 'approved' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /unknown artifact/);

  const rejected = await post(`/api/changes/${id}/gates/spec`, { decision: 'rejected', comment: 'missing acceptance criteria' });
  assert.equal(rejected.status, 200, await rejected.clone().text());
  assert.match(readFileSync(join(r, 'changes', id, 'spec.md'), 'utf8'), /status: rejected/);

  writeArtifact(r, id, 'spec', 'draft');
  const approved = await post(`/api/changes/${id}/gates/spec`, { decision: 'approved' });
  assert.equal(approved.status, 200, await approved.clone().text());
  assert.match(readFileSync(join(r, 'changes', id, 'spec.md'), 'utf8'), /status: approved/);
});

test('write: config is validated, dry runs do not write, valid configs are written and synced', async () => {
  const r = seed();
  const local = createApp({ root: r, token: TOKEN });
  const put = (body: object) =>
    local.request('http://127.0.0.1/api/config', { method: 'PUT', body: JSON.stringify(body), headers: { host: '127.0.0.1', 'x-sdlc-token': TOKEN, 'content-type': 'application/json' } });
  const file = join(r, '.sdlc/config.json');
  const original = readFileSync(file, 'utf8');

  const invalid = await put({ config: { ...CONFIG, locale: 'fr' } });
  assert.equal(invalid.status, 422);
  assert.ok((await invalid.json()).issues.length > 0);

  const next = { ...CONFIG, append_only_paths: ['db/migrate/**'] };
  const dry = await (await put({ config: next, dryRun: true })).json();
  assert.equal(dry.ok, true);
  assert.match(dry.after, /db\/migrate/);
  assert.equal(readFileSync(file, 'utf8'), original, 'dry run leaves the file alone');

  const saved = await (await put({ config: next })).json();
  assert.equal(saved.ok, true);
  assert.ok(saved.sync, 'saving runs sync');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).append_only_paths, ['db/migrate/**']);

  const cfg = await (await local.request('http://127.0.0.1/api/config', { headers: { host: '127.0.0.1', 'x-sdlc-token': TOKEN } })).json();
  assert.deepEqual(cfg.config.append_only_paths, ['db/migrate/**']);
  assert.ok(cfg.schema, 'the JSON schema drives the Settings form');
});

test('write: sync and workspaces', async () => {
  const sync = await json('/api/sync', { method: 'POST', body: '{}' });
  assert.ok(Array.isArray(sync.written) || typeof sync === 'object');

  const other = seed();
  const added = await req('/api/workspaces', { method: 'POST', body: JSON.stringify({ path: other }) });
  assert.equal(added.status, 200);
  const list: { path: string }[] = await json('/api/workspaces');
  assert.ok(list.some((w) => w.path === other));
  assert.equal((await req(`/api/state?ws=${encodeURIComponent(other)}`)).status, 200, 'a registered workspace can be read');
  assert.match(readFileSync(join(base, 'config/sdlc/workspaces.json'), 'utf8'), new RegExp(other.replace(/[/\\]/g, '.')));

  const notRepo = mkdtempSync(join(tmpdir(), 'sdlc-norepo-'));
  const refused = await req('/api/workspaces', { method: 'POST', body: JSON.stringify({ path: notRepo }) });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /not a git repository/);
});
