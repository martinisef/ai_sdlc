// GitLab (REST, as in CI without glab) and Bitbucket Cloud against a local HTTP server that records every request.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { commitStatus, detectProvider, httpJson, loadConfig, prChecks, prComment, prComments, prCreate, prCurrent, SdlcError, type VcsContext } from '@ai-native-sdlc/core';
import { gitIn, repo } from './helpers.ts';

interface Seen {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: any;
}

const seen: Seen[] = [];
let replies: Record<string, { status?: number; body: unknown }> = {};
let base = '';
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    seen.push({ method: req.method!, url: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
    const reply = replies[`${req.method} ${req.url!.split('?')[0]}`] ?? { body: {} };
    res.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
});

before(async () => {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const reset = (r: typeof replies = {}) => {
  seen.length = 0;
  replies = r;
};
// an empty PATH: no gh/glab, so GitLab takes the REST route
const noTools = mkdtempSync(join(tmpdir(), 'sdlc-vcs-bin-'));

function ctx(config: object, env: NodeJS.ProcessEnv, remote?: string): VcsContext {
  const root = repo({ version: 1, ...config });
  if (remote) gitIn(root, 'remote', 'add', 'origin', remote);
  gitIn(root, 'checkout', '-qb', 'change/claims');
  return { root, loaded: loadConfig(root), env: { PATH: noTools, ...env } };
}

test('detectProvider: config wins, then the remote URL', () => {
  const r = repo();
  assert.equal(detectProvider(r), undefined);
  gitIn(r, 'remote', 'add', 'origin', 'git@gitlab.example.com:acme/shop.git');
  assert.equal(detectProvider(r), 'gitlab');
  gitIn(r, 'remote', 'set-url', 'origin', 'https://bitbucket.org/acme/shop.git');
  assert.equal(detectProvider(r), 'bitbucket');
  assert.equal(detectProvider(r, { path: '', legacy: false, issues: [], config: { version: 1, vcs: { provider: 'github' } } } as never), 'github');
});

test('httpJson: JSON in and out; HTTP and network errors become SdlcError', async () => {
  reset({ 'POST /echo': { body: { ok: 1 } }, 'GET /boom': { status: 503, body: { message: 'down' } } });
  assert.deepEqual(await httpJson('POST', `${base}/echo`, { 'x-k': 'v' }, { a: 1 }), { ok: 1 });
  assert.equal(seen[0].headers['content-type'], 'application/json');
  assert.equal(seen[0].headers['x-k'], 'v');
  assert.deepEqual(seen[0].body, { a: 1 });
  await assert.rejects(httpJson('GET', `${base}/boom`, {}), (e: unknown) => e instanceof SdlcError && /HTTP 503/.test(e.message) && /down/.test(e.message));
  await assert.rejects(httpJson('GET', 'http://127.0.0.1:1/x', {}), SdlcError);
});

test('gitlab without glab: MR notes and commit statuses over REST with the project token', async () => {
  const env = { GITLAB_TOKEN: 'glpat-test', CI_API_V4_URL: `${base}/api/v4`, CI_PROJECT_ID: '42' };
  const c = ctx({ vcs: { provider: 'gitlab' } }, env);
  reset();
  assert.equal(await prComment(c, 7, 'Looks good'), 'comment posted on MR !7');
  assert.deepEqual([seen[0].method, seen[0].url, seen[0].headers['private-token'], seen[0].body], ['POST', '/api/v4/projects/42/merge_requests/7/notes', 'glpat-test', { body: 'Looks good' }]);

  reset();
  const long = 'x'.repeat(200);
  assert.equal(await commitStatus(c, 'abcdef1234', { state: 'failure', context: 'sdlc/gates', description: long, url: 'https://ci/1' }), 'sdlc/gates: failure on abcdef1');
  assert.equal(seen[0].url, '/api/v4/projects/42/statuses/abcdef1234');
  assert.deepEqual(seen[0].body, { state: 'failed', name: 'sdlc/gates', description: 'x'.repeat(139), target_url: 'https://ci/1' });

  const bare = ctx({ vcs: { provider: 'gitlab' } }, {});
  await assert.rejects(prComment(bare, 7, 'x'), /GITLAB_TOKEN, CI_API_V4_URL and CI_PROJECT_ID/);
  await assert.rejects(commitStatus(bare, 'abc', { state: 'success', context: 'c', description: 'd' }), /required for commit statuses/);
});

test('bitbucket: PRs, comments, statuses and checks over REST; workspace/repo from the remote', async () => {
  const c = ctx({}, { BITBUCKET_ACCESS_TOKEN: 'bb-token', BITBUCKET_API: base }, 'git@bitbucket.org:acme/shop.git');
  const pr = (n: number) => `/repositories/acme/shop/pullrequests${n ? `/${n}` : ''}`;
  reset({
    [`POST ${pr(0)}`]: { body: { links: { html: { href: 'https://bitbucket.org/acme/shop/pull-requests/3' } } } },
    [`GET ${pr(0)}`]: { body: { values: [{ id: 3, state: 'OPEN', links: { html: { href: 'https://bb/3' } } }] } },
    [`GET ${pr(3)}/comments`]: {
      body: {
        values: [
          { user: { display_name: 'Ana' }, content: { raw: 'nit: rename' }, inline: { path: 'src/app.py' }, resolution: { type: 'resolved' } },
          { user: { display_name: 'Bo' }, content: { raw: 'gone' }, deleted: true },
          { user: { display_name: 'Bo' }, content: { raw: 'LGTM' } },
        ],
      },
    },
    [`GET ${pr(3)}/statuses`]: { body: { values: [{ key: 'sdlc/gates', state: 'SUCCESSFUL' }] } },
  });

  assert.equal(await prCreate(c, { title: 'Claims export', body: 'Spec: …', draft: true }), 'https://bitbucket.org/acme/shop/pull-requests/3');
  assert.equal(seen[0].headers.authorization, 'Bearer bb-token');
  assert.deepEqual(seen[0].body, { title: 'Claims export', description: 'Spec: …', source: { branch: { name: 'change/claims' } }, destination: { branch: { name: 'main' } }, draft: true });

  assert.deepEqual(await prCurrent(c), { number: 3, url: 'https://bb/3', state: 'open' });
  assert.equal(decodeURIComponent(seen[1].url.split('?q=')[1]), 'source.branch.name="change/claims" AND state="OPEN"');

  assert.equal(await prComment(c, 3, 'hello'), 'comment posted on PR #3');
  assert.deepEqual(seen[2].body, { content: { raw: 'hello' } });

  assert.deepEqual(await prComments(c, 3), [
    { author: 'Ana', body: 'nit: rename', path: 'src/app.py', resolved: true },
    { author: 'Bo', body: 'LGTM', path: null, resolved: false },
  ]);

  reset(replies);
  await commitStatus(c, 'abc1234', { state: 'pending', context: 'sdlc/gates', description: 'waiting on spec' });
  assert.equal(seen[0].url, '/repositories/acme/shop/commit/abc1234/statuses/build');
  assert.deepEqual(seen[0].body, { state: 'INPROGRESS', key: 'sdlc/gates', name: 'sdlc/gates', description: 'waiting on spec', url: 'https://bitbucket.org' });

  assert.deepEqual(await prChecks(c, 3), [{ name: 'sdlc/gates', state: 'successful' }]);
});

test('bitbucket: basic auth with an API token, config workspace/repo, and clear errors', async () => {
  const c = ctx({ vcs: { provider: 'bitbucket', workspace: 'team', repo: 'api' } }, { BITBUCKET_USER: 'ana', BITBUCKET_API_TOKEN: 's3cret', BITBUCKET_API: base });
  reset();
  await prComment(c, 9, 'x');
  assert.equal(seen[0].url, '/repositories/team/api/pullrequests/9/comments');
  assert.equal(seen[0].headers.authorization, `Basic ${Buffer.from('ana:s3cret').toString('base64')}`);

  await assert.rejects(prComment(ctx({ vcs: { provider: 'bitbucket' } }, { BITBUCKET_API: base }), 1, 'x'), /missing Bitbucket credentials/);
  await assert.rejects(prComment(ctx({ vcs: { provider: 'bitbucket' } }, { BITBUCKET_ACCESS_TOKEN: 't', BITBUCKET_API: base }), 1, 'x'), /workspace\/repo/);
  await assert.rejects(prComment(ctx({}, {}), 1, 'x'), /could not determine the VCS provider/);
});
