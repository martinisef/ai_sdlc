// `sdlc ci gate` / `gate-status` against the gh stub.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseGateCommand } from '../src/ci/gates.ts';
import { commitAll, project, sdlc } from './helpers.ts';

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
