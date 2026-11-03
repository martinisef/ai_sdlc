// `sdlc ci gate` / `gate-status` against the gh stub.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseGateCommand } from '../src/ci/gates.ts';
import { commitAll, project, sdlc } from './helpers.ts';

const BODY = '## What and why\nExport.\n## Testing\nnpm test, green.\n## Risk\nmedium: new export module.\n## How to revert\nRevert the PR; no migrations.\n';
const stubLog = () => join(mkdtempSync(join(tmpdir(), 'sdlc-stub-')), 'calls.log');
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

test('parseGateCommand: first matching line, optional reason', () => {
  assert.deepEqual(parseGateCommand('/approve spec'), { decision: 'approved', artifact: 'spec', comment: undefined });
  assert.deepEqual(parseGateCommand('LGTM\r\n/reject plan split the migration'), { decision: 'rejected', artifact: 'plan', comment: 'split the migration' });
  assert.equal(parseGateCommand('please /approve spec'), undefined);
  assert.equal(parseGateCommand('/approve code'), undefined);
});

function changeRepo(config: object) {
  const root = project({ vcs: { provider: 'github' }, gates: { spec: ['po'] }, roles: { po: ['@ana'] }, ...config }, 'change/export');
  mkdirSync(join(root, 'changes/2026-11-export'), { recursive: true });
  writeFileSync(join(root, 'changes/2026-11-export/intent.md'), '---\nstatus: accepted\n---\n# Intent: export\n');
  writeFileSync(join(root, 'changes/2026-11-export/spec.md'), '---\nstatus: draft\nauthor: Bob\n---\n# Spec: export\n');
  commitAll(root, 'artifacts');
  const remote = join(mkdtempSync(join(tmpdir(), 'sdlc-remote-')), 'r.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
  return { root, remote };
}

const env = (log: string, body: string, login: string, extra: Record<string, string> = {}) => ({
  STUB_LOG: log,
  PR_NUMBER: '7',
  HEAD_REF: 'change/export',
  COMMENT_BODY: body,
  COMMENT_AUTHOR: login,
  AUTHOR_ASSOCIATION: 'MEMBER',
  PR_AUTHOR: 'bob',
  GIT_COMMITTER_NAME: 'ci',
  GIT_COMMITTER_EMAIL: 'ci@example.com',
  ...extra,
});

test('ci gate: a role member approves by @login; commit pushed, reply posted, sdlc/gates updated', async () => {
  const { root, remote } = changeRepo({});
  const log = stubLog();
  const r = await sdlc(root, ['ci', 'gate'], env(log, '/approve spec ship it', 'ana'));
  assert.equal(r.code, 0, r.err);
  assert.match(readFileSync(join(root, 'changes/2026-11-export/spec.md'), 'utf8'), /^status: approved$/m);
  const msg = execFileSync('git', ['log', '-1', '--format=%an|%B'], { cwd: root, encoding: 'utf8' });
  assert.match(msg, /^ana\|chore\(export\): approve spec[\s\S]*ship it[\s\S]*Gate: spec approved by ana/);
  assert.ok(execFileSync('git', ['--git-dir', remote, 'rev-parse', 'change/export'], { encoding: 'utf8' }).trim());
  const calls = read(log);
  assert.match(calls, /gh pr comment 7 --body ## Gate \(ai-sdlc\)[\s\S]*\*\*spec\*\* of `export` approved by @ana/);
  assert.match(calls, /gh api -X POST repos\/\{owner\}\/\{repo\}\/statuses\/\w+ -f state=pending -f context=sdlc\/gates -f description=export: plan not written yet/);
});

test('ci gate: refuses non-members, the PR author on spec/plan, and people outside the role', async () => {
  const { root } = changeRepo({});
  const log = stubLog();
  await sdlc(root, ['ci', 'gate'], env(log, '/approve spec', 'eve', { AUTHOR_ASSOCIATION: 'NONE' }));
  await sdlc(root, ['ci', 'gate'], env(log, '/approve spec', 'bob'));
  await sdlc(root, ['ci', 'gate'], env(log, '/approve spec', 'carl'));
  await sdlc(root, ['ci', 'gate'], env(log, '/approve spec', 'dependabot[bot]'));
  const calls = read(log);
  assert.match(calls, /@eve cannot decide gates here \(none\)/);
  assert.match(calls, /@bob opened this PR, so another person must decide the spec/);
  assert.match(calls, /Not recorded: spec needs approval from: po/);
  assert.match(calls, /Not recorded: .*looks like an agent or bot/);
  assert.match(readFileSync(join(root, 'changes/2026-11-export/spec.md'), 'utf8'), /^status: draft$/m);
});

test('ci gate-status: success once the plan is approved, and for branches without a change', async () => {
  const { root } = changeRepo({});
  writeFileSync(join(root, 'changes/2026-11-export/spec.md'), '---\nstatus: approved\n---\n');
  writeFileSync(join(root, 'changes/2026-11-export/plan.md'), '---\nstatus: approved\n---\n');
  commitAll(root, 'approved');
  const log = stubLog();
  await sdlc(root, ['ci', 'gate-status'], { STUB_LOG: log, HEAD_REF: 'change/export', HEAD_SHA: 'abc1234' });
  await sdlc(root, ['ci', 'gate-status'], { STUB_LOG: log, HEAD_REF: 'docs/typo', HEAD_SHA: 'def5678' });
  const calls = read(log);
  assert.match(calls, /statuses\/abc1234 -f state=success -f context=sdlc\/gates -f description=export: intent, spec and plan approved/);
  assert.match(calls, /statuses\/def5678 -f state=success .*not gated/);
});

test('ci gate notifies gate.decided and the next gate.pending; gate-status announces only new artifacts', async () => {
  const { createServer } = await import('node:http');
  const bodies: any[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => (bodies.push(JSON.parse(raw)), res.end('ok')));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const hook = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  try {
    const { root } = changeRepo({ notify: { format: 'generic' } });
    writeFileSync(join(root, 'changes/2026-11-export/plan.md'), '---\nstatus: draft\n---\n# Plan\n');
    commitAll(root, 'plan');
    const r = await sdlc(root, ['ci', 'gate'], env(stubLog(), '/approve spec', 'ana', { SDLC_NOTIFY_WEBHOOK: hook }));
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(bodies.map((b) => b.event), ['gate.decided', 'gate.pending']);
    assert.equal(bodies[0].title, 'export: spec approved by @ana');
    assert.equal(bodies[1].artifact, 'plan');

    bodies.length = 0;
    const status = { STUB_LOG: stubLog(), HEAD_REF: 'change/export', SDLC_NOTIFY_WEBHOOK: hook };
    await sdlc(root, ['ci', 'gate-status'], status);
    assert.equal(bodies.length, 0, 'the last commit did not touch plan.md');
    await sdlc(root, ['ci', 'gate-status'], { ...status, PR_ACTION: 'opened' });
    assert.deepEqual(bodies.map((b) => [b.event, b.artifact]), [['gate.pending', 'plan']]);
  } finally {
    server.close();
  }
});

test('ci gate-status, graded: approvals on the PR against the tier, pinned to their commit', async () => {
  const root = project({ vcs: { provider: 'github' }, risk: { profile: 'graded', trusted_authors: ['@ana', 'Ana'] } }, 'change/export');
  mkdirSync(join(root, 'changes/2026-11-export'), { recursive: true });
  for (const a of ['intent', 'spec', 'plan']) writeFileSync(join(root, `changes/2026-11-export/${a}.md`), `---\nstatus: ${a === 'intent' ? 'accepted' : 'approved'}\napproved_by: Ana\nauthor: Ana\n---\n# ${a}\n`);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/export.ts'), Array.from({ length: 80 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n');
  writeFileSync(join(root, 'src/old.ts'), 'x\n'.repeat(60));
  commitAll(root, 'code');
  writeFileSync(join(root, 'src/old.ts'), 'y\n'.repeat(60));
  commitAll(root, 'more code');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-gh-'));
  const log = join(dir, 'calls.log');
  const base = { STUB_LOG: log, STUB_GH_DIR: dir, PR_NUMBER: '7', HEAD_REF: 'change/export', BASE_REF: 'main', HEAD_SHA: head, PR_BODY: BODY };

  // medium risk (70 weighted lines: both files are new); a PR opened by an untrusted author needs another person
  await sdlc(root, ['ci', 'gate-status'], { ...base, PR_AUTHOR: 'eve' });
  assert.match(read(log), /state=pending -f context=sdlc\/gates -f description=export: code needs 1 more approval at medium risk \(0\/1\)/);

  // the trusted director counts as the one person
  await sdlc(root, ['ci', 'gate-status'], { ...base, PR_AUTHOR: 'ana' });
  assert.match(read(log), /state=success -f context=sdlc\/gates -f description=export: gates hold at medium risk; code 1\/1, @ana counts as reviewer/);

  // an approval from eve on an older commit does not count after an agent pushed
  writeFileSync(join(root, 'src/old.ts'), 'z\n'.repeat(60));
  execFileSync('git', ['-c', 'user.name=claude[bot]', '-c', 'user.email=bot@anthropic.com', 'commit', '-qam', 'agent'], { cwd: root });
  const head2 = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  writeFileSync(join(dir, 'pulls_7_reviews'), [JSON.stringify({ login: 'lia', state: 'APPROVED', sha: head }), JSON.stringify({ login: 'dependabot[bot]', state: 'APPROVED', sha: head2 })].join('\n') + '\n');
  await sdlc(root, ['ci', 'gate-status'], { ...base, HEAD_SHA: head2, PR_AUTHOR: 'eve' });
  assert.match(read(log), /description=export: code needs 1 more approval at medium risk \(0\/1; new commits invalidated @lia\)/);

  writeFileSync(join(dir, 'pulls_7_reviews'), JSON.stringify({ login: 'lia', state: 'APPROVED', sha: head2 }) + '\n');
  await sdlc(root, ['ci', 'gate-status'], { ...base, HEAD_SHA: head2, PR_AUTHOR: 'eve' });
  assert.match(read(log), /state=success -f context=sdlc\/gates -f description=export: gates hold at medium risk; code 1\/1/);
});

test('ci gate-status: a PR needs Testing, Risk (at least the computed tier) and How to revert before sdlc/gates is green', async () => {
  const { root } = changeRepo({});
  writeFileSync(join(root, 'changes/2026-11-export/spec.md'), '---\nstatus: approved\n---\n');
  writeFileSync(join(root, 'changes/2026-11-export/plan.md'), '---\nstatus: approved\n---\n');
  commitAll(root, 'approved');
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-gh-'));
  const log = join(dir, 'calls.log');
  const run = (extra: Record<string, string>) => sdlc(root, ['ci', 'gate-status', '--dry-run'], { STUB_LOG: log, HEAD_REF: 'change/export', HEAD_SHA: 'abc1234', PR_NUMBER: '7', ...extra });
  assert.equal((await run({ PR_BODY: BODY })).out, 'sdlc/gates: success — export: intent, spec and plan approved');
  assert.equal((await run({ PR_BODY: '## What\nx\n## Testing\n<!-- how -->\n' })).out, 'sdlc/gates: failure — the PR description needs ## Testing, ## Risk, ## How to revert');
  assert.equal((await run({ PR_BODY: '## Pruebas\nok\n## Riesgo\nbajo\n## Cómo revertir\nrevert\n' })).out, 'sdlc/gates: success — export: intent, spec and plan approved', 'Spanish headings count');
  assert.match((await run({ PR_BODY: BODY.replace('medium: new', 'none really') })).out, /failure — ## Risk must state the tier/);

  const strict = await sdlc(root, ['ci', 'gate-status'], { STUB_LOG: log, STUB_GH_DIR: dir, HEAD_REF: 'change/export', HEAD_SHA: 'abc1234', PR_NUMBER: '7' });
  assert.equal(strict.code, 0, strict.err);
  assert.match(read(log), /gh api repos\/\{owner\}\/\{repo\}\/pulls\/7 --jq \.body \/\/ ""/, 'without PR_BODY the description is read from the forge');
  assert.match(read(log), /statuses\/abc1234 -f state=failure -f context=sdlc\/gates -f description=the PR description needs/);
  writeFileSync(join(dir, 'pulls_7'), BODY);
  await sdlc(root, ['ci', 'gate-status'], { STUB_LOG: log, STUB_GH_DIR: dir, HEAD_REF: 'change/export', HEAD_SHA: 'def5678', PR_NUMBER: '7' });
  assert.match(read(log), /statuses\/def5678 -f state=success/);

  writeFileSync(join(root, '.sdlc/config.json'), JSON.stringify({ version: 1, vcs: { provider: 'github' }, ci: { pr_sections: [] } }));
  assert.match((await run({ PR_BODY: '' })).out, /^sdlc\/gates: success/, 'ci.pr_sections [] turns the check off');
});

test('ci merge-queue: carries sdlc/gates and sdlc/review to the queue commit only when every PR in the group has them green', async () => {
  const root = project({ vcs: { provider: 'github' } });
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-gh-'));
  const log = join(dir, 'calls.log');
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  writeFileSync(join(dir, `commits_${a}_status`), [JSON.stringify({ context: 'sdlc/gates', state: 'success' }), JSON.stringify({ context: 'sdlc/review', state: 'success' })].join('\n') + '\n');
  writeFileSync(join(dir, `commits_${b}_status`), [JSON.stringify({ context: 'sdlc/gates', state: 'success' }), JSON.stringify({ context: 'sdlc/review', state: 'failure' })].join('\n') + '\n');
  const env = { STUB_LOG: log, STUB_GH_DIR: dir, HEAD_SHA: 'q'.repeat(7) };
  const r = await sdlc(root, ['ci', 'merge-queue'], { ...env, MERGE_GROUP_REF: `refs/heads/gh-readonly-queue/main/pr-12-${a}` });
  assert.equal(r.code, 0, r.err);
  assert.match(read(log), /statuses\/qqqqqqq -f state=success -f context=sdlc\/gates -f description=green on #12 before the merge queue/);
  assert.match(read(log), /statuses\/qqqqqqq -f state=success -f context=sdlc\/review/);
  await sdlc(root, ['ci', 'merge-queue'], { ...env, MERGE_GROUP_REF: `refs/heads/gh-readonly-queue/main/pr-12-${a}-pr-13-${b}` });
  assert.match(read(log), /statuses\/qqqqqqq -f state=failure -f context=sdlc\/review -f description=not green on #13/);
  const bad = await sdlc(root, ['ci', 'merge-queue'], { STUB_LOG: log });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /needs HEAD_SHA and MERGE_GROUP_REF/);
});
