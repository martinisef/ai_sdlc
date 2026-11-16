// `sdlc vcs` / `sdlc tracker` end to end: the CLI runs as a subprocess against stubbed gh/glab
// (tests/stubs) and a local HTTP server standing in for Bitbucket, GitLab and Jira.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const MAIN = join(REPO, 'packages/cli/src/main.ts');
const STUBS = join(REPO, 'tests/stubs');

const tmp = mkdtempSync(join(tmpdir(), 'sdlc-integrations-'));
const proj = join(tmp, 'proj');
const stubLog = join(tmp, 'calls.log');
const body = join(tmp, 'body.md');
let server: Server;
let api = '';
let calls: string[] = [];
let failOn: string | undefined;

function respond(method: string, url: string, data = ''): unknown {
  const m = `${method} ${url}`;
  if (m === 'GET /gh/repos/acme/app/issues/5')
    return { number: 5, title: 'Claims status', state: 'open', labels: [{ name: 'sdlc:spec' }, { name: 'enhancement' }], body: 'b', html_url: 'https://github.com/acme/app/issues/5' };
  if (m === 'POST /gh/repos/acme/app/issues') return { number: 9, id: 909 };
  if (m.startsWith('GET /gh/repos/acme/app/issues?state=all'))
    return [
      { number: 5, title: 'Claims status', state: 'open', labels: [{ name: 'sdlc:spec' }], html_url: 'u5', assignee: { login: 'ana' } },
      { number: 6, title: 'A pull request', state: 'open', labels: [], html_url: 'u6', pull_request: {} },
      { number: 4, title: 'Old export', state: 'closed', state_reason: 'not_planned', labels: [], html_url: 'u4' },
    ];
  if (m.startsWith('GET /gh/search/issues?q=')) return { items: [{ number: 3, title: 'Refund by card', state: 'closed', state_reason: 'completed', labels: [], html_url: 'u3' }] };
  if (url.startsWith('/gh/')) return method === 'DELETE' ? undefined : {};
  if (url === '/linear') {
    const q = JSON.parse(data).query as string;
    if (q.includes('teams(')) return { data: { teams: { nodes: [{ id: 'team-1', states: { nodes: [{ id: 's1', name: 'Todo' }, { id: 's2', name: 'In Design' }, { id: 's3', name: 'Done' }] } }] } } };
    if (q.includes('issue(id: $id) { id }')) return { data: { issue: { id: 'uuid-1' } } };
    if (q.includes('issue(id: $id)')) return { data: { issue: { identifier: 'ENG-7', title: 'Claims status', description: null, url: 'https://linear.app/acme/issue/ENG-7', state: { name: 'Todo' }, labels: { nodes: [] } } } };
    if (q.includes('issues(filter'))
      return {
        data: {
          issues: {
            nodes: [
              { identifier: 'ENG-7', title: 'Claims status', url: 'l7', state: { name: 'In Design', type: 'started' }, labels: { nodes: [] }, assignee: { name: 'Ana' } },
              { identifier: 'ENG-2', title: 'Old export', url: 'l2', state: { name: 'Canceled', type: 'canceled' }, labels: { nodes: [] }, assignee: null },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    if (q.includes('issueCreate')) return { data: { issueCreate: { issue: { identifier: 'ENG-8' } } } };
    if (q.includes('commentCreate') && data.includes('fail me')) return { errors: [{ message: 'Entity not found' }] };
    return { data: { issueUpdate: { success: true }, commentCreate: { success: true } } };
  }
  if (/^GET .*\/rest\/api\/2\/project\/.*\/statuses$/.test(m))
    return [{ statuses: [{ name: 'To Do' }, { name: 'In Design' }] }, { statuses: [{ name: 'To Do' }, { name: 'Done' }] }];
  if (/^POST .*\/pullrequests$/.test(m)) return { id: 7, links: { html: { href: 'https://bitbucket.org/acme/app/pull-requests/7' } } };
  if (/^GET .*\/pullrequests\?q=/.test(m)) return { values: [{ id: 7, state: 'OPEN', links: { html: { href: 'https://bitbucket.org/acme/app/pull-requests/7' } } }] };
  if (/^POST .*\/comments$/.test(m)) return { id: 1 };
  if (/^GET .*\/pullrequests\/7\/comments/.test(m))
    return {
      values: [
        { user: { display_name: 'Ana' }, content: { raw: 'rename this' }, inline: { path: 'src/a.py' }, deleted: false, resolution: null },
        { user: { display_name: 'Bo' }, content: { raw: 'old' }, deleted: true },
      ],
    };
  if (/^GET .*\/statuses$/.test(m)) return { values: [{ name: 'build', state: 'SUCCESSFUL' }] };
  if (/^GET .*\/rest\/api\/2\/issue\/PROJ-1\?/.test(m))
    return { key: 'PROJ-1', fields: { summary: 'Claims status', status: { name: 'To Do' }, issuetype: { name: 'Story' }, description: 'Customers call' } };
  if (/^GET .*\/transitions$/.test(m))
    return { transitions: [{ id: '21', name: 'Start design', to: { name: 'In Design' } }, { id: '31', name: 'Start', to: { name: 'In Progress' } }] };
  if (/^POST .*\/transitions$/.test(m) || method === 'PUT') return undefined;
  if (/^POST .*\/rest\/api\/2\/issue$/.test(m)) return { key: 'PROJ-9' };
  const jiraIssue = (key: string, status: string, category: string) => ({ key, fields: { summary: `Issue ${key}`, status: { name: status, statusCategory: { key: category } }, issuetype: { name: 'Story' }, assignee: null } });
  if (m === 'POST /jira/rest/api/3/search/jql')
    return data.includes('"nextPageToken":"p2"') ? { issues: [jiraIssue('PROJ-2', 'Done', 'done')], isLast: true } : { issues: [jiraIssue('PROJ-1', 'In Progress', 'indeterminate')], nextPageToken: 'p2' };
  if (m === 'POST /jiradc/rest/api/2/search') return { issues: [jiraIssue('PROJ-3', 'To Do', 'new')], total: 1 };
  return {};
}

before(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      calls.push(`${req.method} ${req.url} ${data} ${req.headers.authorization ?? req.headers['private-token'] ?? ''}`);
      if (failOn && req.url!.includes(failOn)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      // Data Center has no API v3
      if (req.url!.startsWith('/jiradc/rest/api/3/')) {
        res.writeHead(404).end('not found');
        return;
      }
      const out = respond(req.method!, req.url!, data);
      res.writeHead(out === undefined ? 204 : 200, { 'content-type': 'application/json' }).end(out === undefined ? '' : JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  mkdirSync(join(proj, '.sdlc'), { recursive: true });
  const g = (...a: string[]) => execFileSync('git', a, { cwd: proj, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  g('checkout', '-q', '-b', 'change/PROJ-1-claims-status');
  g('remote', 'add', 'origin', 'git@bitbucket.org:acme/app.git');
  writeFileSync(body, 'Body of the PR\n');
  for (const f of readdirSync(STUBS)) chmodSync(join(STUBS, f), 0o755);
});

after(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});

function config(provider: string, tracker: unknown = { provider: 'none' }) {
  writeFileSync(join(proj, '.sdlc/config.json'), JSON.stringify({ version: 1, vcs: { provider, workspace: 'acme', repo: 'app', default_branch: 'main' }, tracker }));
}

function reset() {
  calls = [];
  writeFileSync(stubLog, '');
}

const logged = (s: string) => calls.some((c) => c.includes(s)) || readFileSync(stubLog, 'utf8').includes(s);

async function sdlc(args: string[], env: Record<string, string | undefined> = {}): Promise<{ code: number; out: string; err: string }> {
  const fullEnv: Record<string, string | undefined> = {
    PATH: `${STUBS}:${process.env.PATH}`,
    HOME: process.env.HOME,
    SDLC_PROJECT_DIR: proj,
    STUB_LOG: stubLog,
    BITBUCKET_API: `${api}/2.0`,
    BITBUCKET_ACCESS_TOKEN: 'x',
    JIRA_BASE_URL: `${api}/jira`,
    JIRA_EMAIL: 'a@b',
    JIRA_API_TOKEN: 't',
    ...env,
  };
  for (const k of Object.keys(fullEnv)) if (fullEnv[k] === undefined) delete fullEnv[k];
  return new Promise((resolve) => {
    execFile(process.execPath, ['--conditions=source', MAIN, ...args], { cwd: proj, env: fullEnv as NodeJS.ProcessEnv }, (e, out, err) =>
      resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out: out.trim(), err }),
    );
  });
}

test('vcs: provider detection', async () => {
  rmSync(join(proj, '.sdlc/config.json'), { force: true });
  assert.equal((await sdlc(['vcs', 'provider'])).out, 'bitbucket', 'detected from the remote');
  config('gitlab');
  assert.equal((await sdlc(['vcs', 'provider'])).out, 'gitlab', 'config overrides the remote');
});

test('vcs: github through gh', async () => {
  config('github');
  reset();
  assert.equal((await sdlc(['vcs', 'pr-create', '--title', 'PROJ-1 Claims status', '--body-file', body])).out, 'https://github.com/acme/app/pull/12');
  assert.ok(logged('--base main --head change/PROJ-1-claims-status'));
  const pr = JSON.parse((await sdlc(['vcs', 'pr-current'])).out);
  assert.deepEqual([pr.number, pr.state], [12, 'open']);
  assert.equal((await sdlc(['vcs', 'pr-checks', '12'])).out, 'test\tsuccess');
});

test('vcs: gitlab through glab, and REST when glab is missing', async () => {
  config('gitlab');
  reset();
  await sdlc(['vcs', 'pr-create', '--title', 'T', '--body-file', body, '--draft']);
  assert.ok(logged('--title Draft: T'));
  assert.ok(logged('--target-branch main'));
  const mr = JSON.parse((await sdlc(['vcs', 'pr-current'])).out);
  assert.deepEqual([mr.number, mr.state], [3, 'opened']);

  const noglab = join(tmp, 'noglab');
  mkdirSync(noglab, { recursive: true });
  symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), join(noglab, 'git'));
  reset();
  const r = await sdlc(['vcs', 'pr-comment', '3', '--body-file', body], { PATH: noglab, GITLAB_TOKEN: 'x', CI_API_V4_URL: `${api}/api/v4`, CI_PROJECT_ID: '42' });
  assert.equal(r.code, 0, r.err);
  assert.ok(logged('POST /api/v4/projects/42/merge_requests/3/notes {"body":"Body of the PR\\n"} x'));
});

test('vcs: bitbucket over REST', async () => {
  config('bitbucket');
  reset();
  assert.equal((await sdlc(['vcs', 'pr-create', '--title', 'T', '--body-file', body])).out, 'https://bitbucket.org/acme/app/pull-requests/7');
  assert.ok(logged('"source":{"branch":{"name":"change/PROJ-1-claims-status"}}'));
  assert.ok(logged('POST /2.0/repositories/acme/app/pullrequests '));
  assert.ok(logged('Bearer x'));
  assert.equal(JSON.parse((await sdlc(['vcs', 'pr-current'])).out).number, 7);
  await sdlc(['vcs', 'pr-comment', '7', '--body-file', body]);
  assert.ok(logged('"content":{"raw":"Body of the PR\\n"}'));
  const comments = (await sdlc(['vcs', 'pr-comments', '7'])).out.split('\n');
  assert.equal(comments.length, 1, 'deleted comments are skipped');
  assert.deepEqual(JSON.parse(comments[0]), { author: 'Ana', body: 'rename this', path: 'src/a.py', resolved: false });
  assert.equal((await sdlc(['vcs', 'pr-checks', '7'])).out, 'build\tsuccessful');
  const noCreds = await sdlc(['vcs', 'pr-current'], { BITBUCKET_ACCESS_TOKEN: undefined });
  assert.equal(noCreds.code, 1);
  assert.match(noCreds.err, /Bitbucket credentials/);
});

test('tracker: jira over REST', async () => {
  config('github');
  reset();
  assert.equal((await sdlc(['tracker', 'get', 'PROJ-1'])).code, 3, 'not configured → exit 3');
  assert.equal((await sdlc(['tracker', 'enabled'])).code, 1);

  config('github', { provider: 'jira', mode: 'linkage', base_url: 'https://acme.atlassian.net/', project_key: 'PROJ', transitions: { spec: 'In Design', plan: 'In Progress' } });
  assert.equal((await sdlc(['tracker', 'enabled'])).code, 0);
  const issue = JSON.parse((await sdlc(['tracker', 'get', 'PROJ-1'])).out);
  assert.deepEqual([issue.summary, issue.status, issue.url], ['Claims status', 'To Do', `${api}/jira/browse/PROJ-1`]);
  assert.ok(logged(`Basic ${Buffer.from('a@b:t').toString('base64')}`));
  assert.equal((await sdlc(['tracker', 'transition', 'PROJ-1', 'spec'])).out, 'PROJ-1 → In Design', 'stage mapped, matched by target status');
  assert.ok(logged('{"transition":{"id":"21"}}'));
  assert.equal((await sdlc(['tracker', 'transition', 'PROJ-1', 'Start'])).out, 'PROJ-1 → Start', 'matched by transition name');
  assert.equal((await sdlc(['tracker', 'transition', 'PROJ-1', 'Done'])).code, 1);
  assert.equal((await sdlc(['tracker', 'create', '--summary', 'S', '--body-file', body, '--type', 'Bug'])).out, 'PROJ-9');
  assert.ok(logged('"issuetype":{"name":"Bug"}'));
  assert.ok(logged('"project":{"key":"PROJ"}'));
  await sdlc(['tracker', 'comment', 'PROJ-1', '--body-file', body]);
  assert.ok(logged('POST /jira/rest/api/2/issue/PROJ-1/comment'));
  await sdlc(['tracker', 'set-description', 'PROJ-1', '--body-file', body]);
  assert.ok(logged('PUT /jira/rest/api/2/issue/PROJ-1 '));
  assert.equal((await sdlc(['tracker', 'statuses'])).out, 'Done\nIn Design\nTo Do');

  failOn = 'comment';
  const r = await sdlc(['tracker', 'comment', 'PROJ-1', '--body-file', body]);
  failOn = undefined;
  assert.equal(r.code, 1);
  assert.match(r.err, /HTTP 403/);

  reset();
  assert.equal((await sdlc(['tracker', 'create', '--summary', 'S', '--body-file', body, '--parent', 'PROJ-5', '--labels', 'api, new thing'])).out, 'PROJ-9');
  assert.ok(logged('"labels":["api","new-thing"],"parent":{"key":"PROJ-5"}'), 'Cloud: parent field; labels without spaces');
  assert.equal((await sdlc(['tracker', 'link', 'PROJ-2', 'PROJ-3'])).out, 'PROJ-2 blocks PROJ-3');
  assert.ok(logged('POST /jira/rest/api/2/issueLink {"type":{"name":"Blocks"},"inwardIssue":{"key":"PROJ-2"},"outwardIssue":{"key":"PROJ-3"}}'));
  config('github', { provider: 'jira', base_url: 'https://jira.acme.local', project_key: 'PROJ', epic_link_field: 'customfield_10014' });
  reset();
  await sdlc(['tracker', 'create', '--summary', 'S', '--body-file', body, '--parent', 'PROJ-5']);
  assert.ok(logged('"customfield_10014":"PROJ-5"'), 'Data Center: the Epic Link custom field');

  const pat = await sdlc(['tracker', 'get', 'PROJ-1'], { JIRA_EMAIL: undefined, JIRA_API_TOKEN: undefined, JIRA_PAT: 'p' });
  assert.equal(pat.code, 0);
  assert.ok(logged('Bearer p'));
});

test('tracker: github issues over REST (labels per stage, merged closes)', async () => {
  config('github', { provider: 'github', default_issue_type: 'enhancement' });
  reset();
  const env = { GH_TOKEN: 'g', GITHUB_API_URL: `${api}/gh` };
  const issue = JSON.parse((await sdlc(['tracker', 'get', '#5'], env)).out);
  assert.deepEqual([issue.key, issue.status, issue.type, issue.url], ['#5', 'sdlc:spec', 'enhancement', 'https://github.com/acme/app/issues/5']);
  assert.ok(logged('GET /gh/repos/acme/app/issues/5  Bearer g'), 'repo from vcs.workspace/repo');
  assert.equal((await sdlc(['tracker', 'transition', 'acme/app#5', 'plan'], env)).out, '#5 → sdlc:plan');
  assert.ok(logged('DELETE /gh/repos/acme/app/issues/5/labels/sdlc%3Aspec'));
  assert.ok(logged('POST /gh/repos/acme/app/issues/5/labels {"labels":["sdlc:plan"]}'));
  assert.equal((await sdlc(['tracker', 'transition', '5', 'merged'], env)).out, '#5 → sdlc:merged (closed)');
  assert.ok(logged('PATCH /gh/repos/acme/app/issues/5 {"state":"closed","state_reason":"completed"}'));
  assert.equal((await sdlc(['tracker', 'create', '--summary', 'S', '--body-file', body], env)).out, '#9');
  assert.ok(logged('"labels":["enhancement"]'));
  await sdlc(['tracker', 'comment', '#5', '--body-file', body], env);
  assert.ok(logged('POST /gh/repos/acme/app/issues/5/comments'));
  reset();
  assert.equal((await sdlc(['tracker', 'create', '--summary', 'S', '--body-file', body, '--parent', '#5', '--labels', 'api'], env)).out, '#9');
  assert.ok(logged('"labels":["enhancement","api"]'));
  assert.ok(logged('POST /gh/repos/acme/app/issues/5/sub_issues {"sub_issue_id":909}'), 'stories become sub-issues of the epic');
  reset();
  failOn = 'sub_issues';
  assert.equal((await sdlc(['tracker', 'create', '--summary', 'S', '--body-file', body, '--parent', '#5'], env)).code, 0);
  failOn = undefined;
  assert.ok(logged('PATCH /gh/repos/acme/app/issues/5 {"body":"b\\n- [ ] #9"}'), 'without sub-issues: a task list in the epic');
  reset();
  assert.equal((await sdlc(['tracker', 'link', '#9', '#5'], env)).out, '#9 blocks #5');
  assert.ok(logged('PATCH /gh/repos/acme/app/issues/5 {"body":"b\\n\\nBlocked by #9"}'));
  assert.equal((await sdlc(['tracker', 'statuses'], env)).out.split('\n').at(-1), 'closed');
  const noToken = await sdlc(['tracker', 'get', '#5'], { GITHUB_API_URL: `${api}/gh`, GH_TOKEN: undefined, GITHUB_TOKEN: undefined });
  assert.equal(noToken.code, 1);
  assert.match(noToken.err, /GH_TOKEN/);
});

test('tracker: linear over GraphQL (workflow states, errors surface)', async () => {
  config('github', { provider: 'linear', team_key: 'ENG', transitions: { spec: 'In Design', merged: 'Done' } });
  reset();
  const env = { LINEAR_API_KEY: 'lin_x', LINEAR_API_URL: `${api}/linear` };
  const issue = JSON.parse((await sdlc(['tracker', 'get', 'ENG-7'], env)).out);
  assert.deepEqual([issue.key, issue.status, issue.url], ['ENG-7', 'Todo', 'https://linear.app/acme/issue/ENG-7']);
  assert.ok(logged(' lin_x'), 'raw API key in the authorization header');
  assert.equal((await sdlc(['tracker', 'transition', 'ENG-7', 'spec'], env)).out, 'ENG-7 → In Design');
  assert.ok(logged('"variables":{"id":"uuid-1","state":"s2"}'));
  assert.equal((await sdlc(['tracker', 'transition', 'ENG-7', 'Shipped'], env)).code, 1);
  assert.equal((await sdlc(['tracker', 'create', '--summary', 'S', '--body-file', body], env)).out, 'ENG-8');
  assert.ok(logged('"team":"team-1"'));
  assert.ok(logged('"parent":null'));
  reset();
  await sdlc(['tracker', 'create', '--summary', 'S', '--body-file', body, '--parent', 'ENG-7'], env);
  assert.ok(logged('"parent":"uuid-1"'), 'the epic is the parent issue');
  assert.equal((await sdlc(['tracker', 'link', 'ENG-7', 'ENG-8'], env)).out, 'ENG-7 blocks ENG-8');
  assert.ok(logged('issueRelationCreate(input: { issueId: $a, relatedIssueId: $b, type: blocks })'));
  assert.equal((await sdlc(['tracker', 'statuses'], env)).out, 'Done\nIn Design\nTodo');
  writeFileSync(join(tmp, 'fail.md'), 'fail me');
  const r = await sdlc(['tracker', 'comment', 'ENG-7', '--body-file', join(tmp, 'fail.md')], env);
  assert.equal(r.code, 1);
  assert.match(r.err, /Linear: Entity not found/);
});

test('tracker search: open and closed issues, one category for every provider, read only', async () => {
  const lines = (out: string) => out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  config('github', { provider: 'jira', base_url: 'https://acme.atlassian.net', project_key: 'PROJ' });
  reset();
  const cloud = lines((await sdlc(['tracker', 'search', 'refund "card"', '--limit', '5'])).out);
  assert.deepEqual(cloud.map((i) => [i.key, i.category]), [['PROJ-1', 'in_progress'], ['PROJ-2', 'done']], 'two pages');
  assert.ok(logged('"jql":"project = \\"PROJ\\" AND text ~ \\"refund \\\\\\"card\\\\\\"\\" ORDER BY updated DESC"'), 'the text is quoted for JQL');
  assert.ok(!('description' in cloud[0]));
  reset();
  const dc = lines((await sdlc(['tracker', 'search'], { JIRA_BASE_URL: `${api}/jiradc` })).out);
  assert.deepEqual(dc.map((i) => [i.key, i.category]), [['PROJ-3', 'todo']], 'Data Center: falls back to API v2');
  assert.ok(!calls.some((c) => /^(PUT|PATCH|DELETE)|\/issue /.test(c)), 'nothing written');

  config('github', { provider: 'github' });
  const gh = { GH_TOKEN: 'g', GITHUB_API_URL: `${api}/gh` };
  reset();
  assert.deepEqual(lines((await sdlc(['tracker', 'search'], gh)).out).map((i) => [i.key, i.category, i.assignee]), [['#5', 'in_progress', 'ana'], ['#4', 'cancelled', null]], 'pull requests are left out');
  reset();
  assert.deepEqual(lines((await sdlc(['tracker', 'search', 'refund'], gh)).out).map((i) => [i.key, i.category]), [['#3', 'done']]);
  assert.ok(logged(`GET /gh/search/issues?q=${encodeURIComponent('repo:acme/app is:issue refund')}`));

  config('github', { provider: 'linear', team_key: 'ENG' });
  reset();
  const lin = lines((await sdlc(['tracker', 'search', 'claims'], { LINEAR_API_KEY: 'lin_x', LINEAR_API_URL: `${api}/linear` })).out);
  assert.deepEqual(lin.map((i) => [i.key, i.category, i.status]), [['ENG-7', 'in_progress', 'In Design'], ['ENG-2', 'cancelled', 'Canceled']]);
  assert.ok(logged('"filter":{"team":{"key":{"eq":"ENG"}},"or":[{"title":{"containsIgnoreCase":"claims"}},{"description":{"containsIgnoreCase":"claims"}}]}'));
});
