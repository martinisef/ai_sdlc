import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitIn, repo } from './helpers.ts';
import {
  checkProductionGate,
  decideGate,
  ereToRegExp,
  globMatch,
  listChanges,
  loadConfig,
  metrics,
  parseFrontmatter,
  setFrontmatter,
  stageOf,
  validateConfig,
} from '@ai-native-sdlc/core';


function writeArtifact(root: string, dir: string, name: string, status: string, extra = '') {
  mkdirSync(join(root, 'changes', dir), { recursive: true });
  writeFileSync(join(root, 'changes', dir, `${name}.md`), `---\nstatus: ${status}            # draft → approved\n${extra}---\n# ${name}: Claims status\n`);
}

test('glob: * crosses /, leading **/ optional, classes', () => {
  assert.ok(globMatch('src/gen/a/b.py', 'src/gen/**'));
  assert.ok(globMatch('foo_test.py', '**/*_test.py'));
  assert.ok(globMatch('pkg/foo_test.py', '**/*_test.py'));
  assert.ok(globMatch('a.py', '*.py'));
  assert.ok(globMatch('x1.txt', 'x[0-9].txt'));
  assert.ok(!globMatch('src/app.py', 'src/gen/**'));
  assert.ok(!globMatch('a.py.bak', '*.py'));
});

test('frontmatter: inline comments are not values, and are kept on write', () => {
  const src = '---\nstatus: draft            # draft → accepted\nticket:\n---\n# Intent\n';
  assert.equal(parseFrontmatter(src).data.status, 'draft');
  assert.equal(parseFrontmatter(src).data.ticket, '');
  const out = setFrontmatter(src, { status: 'accepted', approved_by: 'Ana' });
  assert.match(out, /^status: accepted\s+# draft → accepted$/m);
  assert.match(out, /^approved_by: Ana$/m);
  assert.equal(parseFrontmatter(out).data.status, 'accepted');
  assert.ok(out.endsWith('# Intent\n'));
});

test('stageOf follows the artifact chain', () => {
  assert.equal(stageOf({}), 'no-intent');
  assert.equal(stageOf({ intent: { status: 'draft' } }), 'intent-draft');
  assert.equal(stageOf({ intent: { status: 'accepted' } }), 'intent-accepted');
  assert.equal(stageOf({ intent: { status: 'accepted' }, spec: { status: 'approved' }, plan: { status: 'draft' } }), 'plan-draft');
  assert.equal(stageOf({ intent: { status: 'rejected' } }), 'rejected');
});

test('ERE patterns: POSIX classes and case-insensitivity like grep -Ei', () => {
  assert.ok(ereToRegExp('token[[:space:]]*=')!.test('TOKEN  ='));
  assert.equal(ereToRegExp('(unclosed'), undefined);
});

test('production gate splits segments and ignores mentions', () => {
  const ctx = { root: '/x', loaded: { config: { version: 1 as const, production_gate: { patterns: ['deploy.*prod'] } }, path: '.sdlc/config.json', legacy: false, issues: [] }, env: {} };
  assert.equal(checkProductionGate(ctx, 'echo deploy prod', 'en').action, 'allow');
  assert.equal(checkProductionGate(ctx, 'make test && ./deploy prod', 'en').action, 'deny');
  assert.equal(checkProductionGate({ ...ctx, env: { RELEASE_APPROVAL: 'CHG-1' } }, './deploy prod', 'en').action, 'allow');
});

test('config validation reports paths', () => {
  const r = validateConfig({ version: 1, agents: ['vim'] });
  assert.equal(r.ok, false);
  assert.match((r as { issues: string[] }).issues[0], /^agents\.0/);
  assert.equal(validateConfig({ version: 1, protected_paths: ['a/**'], custom: { kept: true } }).ok, true);
});

test('listChanges reads worktree and change/* branches', () => {
  const root = repo();
  writeArtifact(root, '2026-11-claims', 'intent', 'accepted', 'ticket: PROJ-1\norigin: idea\n');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'intent');
  gitIn(root, 'checkout', '-qb', 'change/other');
  writeArtifact(root, '2026-11-other', 'intent', 'draft');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'other intent');
  gitIn(root, 'checkout', '-q', 'main');

  const changes = listChanges(root);
  assert.deepEqual(changes.map((c) => [c.id, c.stage]), [
    ['changes/2026-11-claims', 'intent-accepted'],
    ['changes/2026-11-other', 'intent-draft'],
  ]);
  assert.equal(changes[0].ticket, 'PROJ-1');
  assert.equal(changes[0].title, 'Claims status');
  assert.deepEqual(changes[1].source, { branch: 'change/other' });
  assert.equal(changes[1].waitingFor, 'intent');
});

test('gates: approval is a commit with approver; agents and authors cannot approve', () => {
  const root = repo({ version: 1, gates: { plan: ['tech-lead'] }, roles: { 'tech-lead': ['lead@example.com'] } });
  gitIn(root, 'checkout', '-qb', 'change/claims');
  writeArtifact(root, '2026-11-claims', 'intent', 'draft');
  writeArtifact(root, '2026-11-claims', 'spec', 'draft', 'author: Bob\n');
  writeArtifact(root, '2026-11-claims', 'plan', 'draft');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'artifacts');
  const loaded = loadConfig(root);

  const r = decideGate(root, loaded, '2026-11-claims', 'intent', 'approved', { comment: 'go' });
  assert.equal(r.by, 'Ana Product');
  const intent = readFileSync(join(root, 'changes/2026-11-claims/intent.md'), 'utf8');
  assert.match(intent, /^status: accepted/m);
  assert.match(intent, /^approved_by: Ana Product$/m);
  assert.match(gitIn(root, 'log', '-1', '--format=%B'), /chore\(claims\): approve intent[\s\S]*Gate: intent accepted by Ana Product/);

  assert.throws(() => decideGate(root, loaded, 'claims', 'spec', 'approved', { approver: { name: 'Claude', email: 'noreply@anthropic.com' } }), /agent or bot/);
  assert.throws(() => decideGate(root, loaded, 'claims', 'spec', 'approved', { approver: { name: 'Bob', email: 'bob@example.com' } }), /authored/);
  assert.throws(() => decideGate(root, loaded, 'claims', 'plan', 'approved'), /tech-lead/);
  decideGate(root, loaded, 'claims', 'plan', 'approved', { approver: { name: 'Lead', email: 'lead@example.com' } });
  assert.equal(listChanges(root).find((c) => c.slug === 'claims')?.artifacts.plan?.status, 'approved');
});

test('gates: deciding on a change/* branch that is not checked out commits there without touching the worktree', () => {
  const root = repo({ version: 1 });
  gitIn(root, 'checkout', '-qb', 'change/export');
  writeArtifact(root, '2026-11-export', 'intent', 'draft');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'intent');
  gitIn(root, 'checkout', '-q', 'main');
  writeFileSync(join(root, 'wip.txt'), 'uncommitted');

  const r = decideGate(root, loadConfig(root), 'export', 'intent', 'approved', { comment: 'go' });
  assert.equal(gitIn(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  assert.equal(readFileSync(join(root, 'wip.txt'), 'utf8'), 'uncommitted');
  assert.equal(gitIn(root, 'rev-parse', '--short', 'change/export'), r.commit);
  assert.match(gitIn(root, 'show', 'change/export:changes/2026-11-export/intent.md'), /^status: accepted[\s\S]*^approved_by: Ana Product$/m);
  assert.match(gitIn(root, 'log', '-1', '--format=%B', 'change/export'), /chore\(export\): approve intent\n\ngo\nGate: intent accepted/);
  assert.equal(gitIn(root, 'status', '--porcelain', '--untracked-files=no'), '');
  assert.equal(listChanges(root).find((c) => c.slug === 'export')?.artifacts.intent?.status, 'accepted');
});

test('metrics: lead times and spec rework after plan', () => {
  const root = repo();
  const commitAt = (msg: string, epoch: number) =>
    execFileSync('git', ['commit', '-qm', msg], { cwd: root, env: { ...process.env, GIT_COMMITTER_DATE: `${epoch} +0000`, GIT_AUTHOR_DATE: `${epoch} +0000` } });
  writeArtifact(root, 'c1', 'intent', 'accepted');
  gitIn(root, 'add', '-A');
  commitAt('intent', 1_700_000_000);
  writeArtifact(root, 'c1', 'spec', 'approved');
  gitIn(root, 'add', '-A');
  commitAt('spec', 1_700_000_000 + 2 * 3600);
  writeArtifact(root, 'c1', 'plan', 'draft');
  gitIn(root, 'add', '-A');
  commitAt('plan', 1_700_000_000 + 5 * 3600);
  writeArtifact(root, 'c1', 'spec', 'approved', 'risk: high\n');
  gitIn(root, 'add', '-A');
  commitAt('spec fix', 1_700_000_000 + 6 * 3600);

  const m = metrics(root);
  assert.equal(m.changes[0].intentToSpecH, 2);
  assert.equal(m.changes[0].specToPlanH, 3);
  assert.equal(m.changes[0].specReworkAfterPlan, 1);
  assert.equal(m.summary.specReworkRate, 1);
});
