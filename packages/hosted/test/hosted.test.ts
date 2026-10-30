import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHostedApp, GithubClient } from '@ai-native-sdlc/hosted';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const md = (status: string, title = '', extra = '') => `---\nstatus: ${status}\n${extra}---\n\n${title ? `# Intent: ${title}\n` : ''}`;
const files: Record<string, Record<string, string>> = {
  m1: {
    'changes/_templates/intent.md': md('draft'),
    'changes/2026-10-done/intent.md': md('accepted', 'Done thing'),
    'changes/2026-10-done/spec.md': md('approved'),
    'changes/2026-10-done/plan.md': md('approved'),
    'changes/claims/intent.md': md('draft', 'Old title'),
    'src/app.ts': '',
  },
  c1: { 'changes/claims/intent.md': md('accepted', 'Claims status', 'ticket: PROJ-1\n'), 'changes/claims/spec.md': md('draft', '', 'risk: high\n') },
  p1: { 'changes/payments/intent.md': md('accepted', 'Payments'), 'changes/payments/spec.md': md('approved'), 'changes/payments/plan.md': md('approved') },
  // an unrelated change dir on someone else's branch is ignored
  x1: { 'changes/claims/intent.md': md('rejected', 'Hijack') },
};
const branches = [
  { name: 'main', commit: { sha: 'm1' } },
  { name: 'change/claims', commit: { sha: 'c1' } },
  { name: 'change/payments', commit: { sha: 'p1' } },
  { name: 'change/other', commit: { sha: 'x1' } },
];

let server: Server;
let api = '';
let calls = 0;
before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (req.method === 'POST' && url.pathname === '/app/installations/7/access_tokens') {
      const [h, p, s] = (req.headers.authorization ?? '').replace('Bearer ', '').split('.');
      const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, s, 'base64url');
      if (!ok || JSON.parse(Buffer.from(p, 'base64url').toString()).iss !== '42') return send(401, { message: 'bad jwt' });
      return send(201, { token: 'inst-token', expires_at: new Date(Date.now() + 3600_000).toISOString() });
    }
    if (req.headers.authorization !== 'token inst-token') return send(401, { message: 'no token' });
    calls++;
    if (url.pathname === '/installation/repositories') return send(200, { repositories: [{ full_name: 'acme/api', default_branch: 'main' }, { full_name: 'acme/old', default_branch: 'main', archived: true }] });
    if (url.pathname === '/repos/acme/api/branches') return send(200, branches);
    let m = /^\/repos\/acme\/api\/git\/trees\/(\w+)$/.exec(url.pathname);
    if (m) return send(200, { tree: Object.keys(files[m[1]] ?? {}).map((path) => ({ path, type: 'blob' })) });
    m = /^\/repos\/acme\/api\/contents\/(.+)$/.exec(url.pathname);
    if (m) {
      const body = files[url.searchParams.get('ref')!]?.[decodeURIComponent(m[1])];
      return body === undefined ? send(404, { message: 'Not Found' }) : send(200, body);
    }
    if (url.pathname.startsWith('/repos/acme/api/compare/')) {
      const head = decodeURIComponent(url.pathname.split('...')[1]);
      return send(200, { files: head === 'change/payments' ? [{ filename: 'changes/payments/plan.md' }, { filename: 'src/pay.ts' }] : [{ filename: 'changes/claims/spec.md' }] });
    }
    send(404, { message: 'Not Found' });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const env = { SDLC_HOSTED_TOKEN: 'view', SDLC_HOSTED_WEBHOOK_SECRET: 'whs' };
const gh = () => new GithubClient({ appId: '42', privateKey: pem, installationId: '7', api });

test('hosted: org board from a GitHub App installation, same stages as the CLI', async () => {
  const app = createHostedApp(env, gh());
  assert.equal((await app.request('/api/org')).status, 401);
  const res = await app.request('/api/org', { headers: { authorization: 'Bearer view' } });
  assert.equal(res.status, 200);
  const { repos } = (await res.json()) as { repos: { repo: string; changes: Record<string, any>[] }[] };
  assert.deepEqual(repos.map((r) => r.repo), ['acme/api'], 'archived repos are skipped');
  const by = Object.fromEntries(repos[0].changes.map((c) => [c.dir, c]));
  assert.deepEqual(Object.keys(by).sort(), ['2026-10-done', 'claims', 'payments']);
  assert.equal(by['2026-10-done'].stage, 'merged');
  assert.equal(by.claims.stage, 'spec-draft', 'the change branch wins over the default branch');
  assert.equal(by.claims.title, 'Claims status');
  assert.equal(by.claims.waitingFor, 'spec');
  assert.equal(by.claims.ticket, 'PROJ-1');
  assert.equal(by.claims.risk, 'high');
  assert.equal(by.claims.branch, 'change/claims');
  assert.equal(by.payments.stage, 'building');

  const html = await (await app.request('/?token=view')).text();
  assert.match(html, /Claims status/);
  assert.match(html, /1 repositories · 3 changes · 1 waiting for a gate/);
});

test('hosted: TTL cache, dropped by a signed push webhook', async () => {
  const app = createHostedApp(env, gh());
  const get = () => app.request('/api/org', { headers: { authorization: 'Bearer view' } });
  await get();
  const n = calls;
  await get();
  assert.equal(calls, n, 'second read is served from the cache');

  const body = JSON.stringify({ repository: { full_name: 'acme/api' } });
  assert.equal((await app.request('/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=bad' } })).status, 401);
  const sig = `sha256=${createHmac('sha256', 'whs').update(body).digest('hex')}`;
  const res = await app.request('/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sig, 'x-github-event': 'push' } });
  assert.deepEqual(await res.json(), { invalidated: 'acme/api' });
  await get();
  assert.ok(calls > n, 'the repo is re-read after the push');
});

test('hosted: missing app credentials fail fast', () => {
  assert.throws(() => createHostedApp({}), /GITHUB_APP_ID/);
});
