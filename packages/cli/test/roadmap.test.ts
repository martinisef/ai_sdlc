// `sdlc roadmap` end to end: the CLI as a subprocess, against a local HTTP server standing in for Jira.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '../src/main.ts');
const tmp = mkdtempSync(join(tmpdir(), 'sdlc-roadmap-'));
const proj = join(tmp, 'proj');
let server: Server;
let api = '';
let calls: string[] = [];
let n = 0;

const ROADMAP = (slug: string) => `---
roadmap: ${slug}
status: draft
author: Ana Dev
source: changes/_roadmaps/${slug}/source.md
---
# Roadmap: To-do sharing

## E1 · Sharing

### E1.S1 · Share a list by link
- risk: medium
- depends: E1.S2
- source: §2

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

before(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      calls.push(`${req.method} ${req.url} ${data}`);
      if (req.method === 'POST' && req.url === '/rest/api/2/issue') return void res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ key: `TODO-${++n}` }));
      res.writeHead(201, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mkdirSync(join(proj, '.sdlc'), { recursive: true });
  const g = (...a: string[]) => execFileSync('git', a, { cwd: proj, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Ana Dev');
  g('config', 'user.email', 'ana@example.com');
  writeFileSync(join(proj, '.sdlc/config.json'), JSON.stringify({ version: 1, tracker: { provider: 'jira', base_url: api, project_key: 'TODO' } }));
  g('add', '-A');
  g('commit', '-qm', 'init');
});

after(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});

function sdlc(args: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string; err: string }> {
  const full = { PATH: process.env.PATH, HOME: process.env.HOME, SDLC_PROJECT_DIR: proj, JIRA_EMAIL: 'a@b', JIRA_API_TOKEN: 't', ...env } as NodeJS.ProcessEnv;
  return new Promise((resolve) =>
    execFile(process.execPath, ['--conditions=source', MAIN, ...args], { cwd: proj, env: full }, (e, out, err) =>
      resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out: out.trim(), err: err.trim() }),
    ),
  );
}

test('roadmap: new → check → approve → apply → status → next → find', async () => {
  writeFileSync(join(tmp, 'plan.md'), '# Sharing\n\n## 2. Links\nRead-only links.\n');
  let r = await sdlc(['roadmap', 'new', 'sharing', '--source', join(tmp, 'plan.md')]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^created changes\/_roadmaps\/sharing\/roadmap\.md \(source: changes\/_roadmaps\/sharing\/source\.md\)\nNext: \/sdlc-roadmap sharing/);

  r = await sdlc(['roadmap', 'check', 'sharing']);
  assert.equal(r.code, 1, 'the template has an unanswered question');
  assert.match(r.out, /✗ Q1 has no answer/);
  assert.match((await sdlc(['next'])).out, /The roadmap sharing is still a draft \(1 open question\(s\)\) → \/sdlc-roadmap sharing/);

  writeFileSync(join(proj, 'changes/_roadmaps/sharing/roadmap.md'), ROADMAP('sharing'));
  r = await sdlc(['roadmap', 'check', 'sharing']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '✓ changes/_roadmaps/sharing/roadmap.md: 1 epic, 2 stories, 0 open questions');
  assert.match((await sdlc(['next'])).out, /^Your call: the roadmap sharing \(2 stories\) → sdlc roadmap approve sharing$/);
  execFileSync('git', ['add', '-A'], { cwd: proj });
  execFileSync('git', ['commit', '-qm', 'roadmap: sharing'], { cwd: proj });

  execFileSync('git', ['config', 'user.name', 'Claude'], { cwd: proj });
  r = await sdlc(['roadmap', 'approve', 'sharing']);
  assert.equal(r.code, 1);
  assert.match(r.err, /looks like an agent or bot; a person must approve/);
  execFileSync('git', ['config', 'user.name', 'Ana Dev'], { cwd: proj });
  r = await sdlc(['roadmap', 'approve', 'sharing', '-m', 'go']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^changes\/_roadmaps\/sharing\/roadmap\.md approved by Ana Dev \([0-9a-f]{7}\)\nNext: sdlc roadmap apply sharing creates 3 tickets/);
  assert.match((await sdlc(['next'])).out, /^The roadmap sharing is approved: 3 tickets still to create → sdlc roadmap apply sharing$/);

  r = await sdlc(['roadmap', 'apply', 'sharing', '--dry-run']);
  assert.equal(r.out.split('\n').length, 5);
  assert.match(r.out, /^would create epic     E1 Sharing\nwould create story    E1\.S1 Share a list by link\nwould create story    E1\.S2 List ids\nwould create link     E1\.S2 blocks E1\.S1\n4 action/);
  assert.equal(calls.length, 0, 'a dry run calls nothing');

  r = await sdlc(['roadmap', 'apply', 'sharing']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^TODO-1     epic     E1 Sharing\nTODO-2     story    E1\.S1 Share a list by link\nTODO-3     story    E1\.S2 List ids\nTODO-2     link     E1\.S2 blocks E1\.S1\n3 tickets created, 1 links \(keys saved in [0-9a-f]{7}\)/);
  assert.ok(calls.some((c) => c.includes('"issuetype":{"name":"Epic"}')));
  assert.ok(calls.some((c) => c.includes('"summary":"List ids"') && c.includes('"parent":{"key":"TODO-1"}')));
  assert.ok(calls.some((c) => c.startsWith('POST /rest/api/2/issueLink') && c.includes('"inwardIssue":{"key":"TODO-3"},"outwardIssue":{"key":"TODO-2"}')));
  assert.match(readFileSync(join(proj, 'changes/_roadmaps/sharing/roadmap.md'), 'utf8'), /### E1\.S1 · Share a list by link\n- risk: medium\n- depends: E1\.S2\n- source: §2\n- key: TODO-2\n- links: E1\.S2\n/);

  calls = [];
  assert.equal((await sdlc(['roadmap', 'apply', 'sharing'])).out, 'nothing to do: every item has its ticket and every link exists');
  assert.equal(calls.length, 0);

  assert.equal(
    (await sdlc(['roadmap', 'status'])).out,
    ['sharing', '  E1.S1   TODO-2     blocked by E1.S2         Share a list by link', '  E1.S2   TODO-3     ready                    List ids'].join('\n'),
  );
  assert.match((await sdlc(['next'])).out, /^Next story of the roadmap sharing: E1\.S2 List ids \(TODO-3\) → \/sdlc-intent TODO-3$/);
  assert.match((await sdlc(['roadmap', 'list'])).out, /^sharing\s+approved\s+1 epic, 2 stories, 3\/3 tickets  To-do sharing$/);

  const found = JSON.parse((await sdlc(['roadmap', 'find', 'TODO-2'])).out);
  assert.deepEqual(
    [found.roadmap, found.id, found.epic, found.source, found.document, found.criteria],
    ['sharing', 'E1.S1', 'E1 · Sharing', '§2', 'changes/_roadmaps/sharing/source.md', ['A shared link opens the list read-only']],
  );
  assert.equal((await sdlc(['roadmap', 'find', 'TODO-99'])).code, 1);
});

test('roadmap: without a tracker, apply explains how to go on (exit 3) and the dry run still works', async () => {
  writeFileSync(join(proj, '.sdlc/config.json'), JSON.stringify({ version: 1, tracker: { provider: 'none' } }));
  mkdirSync(join(proj, 'changes/_roadmaps/solo'), { recursive: true });
  writeFileSync(join(proj, 'changes/_roadmaps/solo/roadmap.md'), ROADMAP('solo'));
  execFileSync('git', ['add', '-A'], { cwd: proj });
  execFileSync('git', ['commit', '-qm', 'roadmap: solo'], { cwd: proj });
  const ok = await sdlc(['roadmap', 'approve', 'solo']);
  assert.match(ok.out, /No tracker configured: the roadmap is the plan\. Start each story with \/sdlc-intent/);
  const r = await sdlc(['roadmap', 'apply', 'solo']);
  assert.equal(r.code, 3);
  assert.match(r.err, /tracker not configured .*start each story with \/sdlc-intent/);
  assert.equal((await sdlc(['roadmap', 'apply', 'solo', '--dry-run'])).code, 0);
  assert.match((await sdlc(['roadmap', '--help'])).out, /^sdlc roadmap new <slug> --source/);
});
