// risk.profile graded: approvals per tier, automatic approval when nobody is needed, code approvals pinned to a commit.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { approvalsFor, artifactGate, codeGate, decideGate, getChange, isTrustedAuthor, loadConfig, parseFrontmatter, vouched, type LoadedConfig } from '@ai-native-sdlc/core';
import { gitIn, repo, writeArtifact } from './helpers.ts';

const cfg = (config: Record<string, unknown>) => ({ config: { version: 1, ...config }, path: '', legacy: false, issues: [] }) as LoadedConfig;
const fm = (root: string, dir: string, a: string) => parseFrontmatter(readFileSync(join(root, 'changes', dir, `${a}.md`), 'utf8')).data;

test('approvalsFor: strict keeps one per gate; graded scales; the intent always needs a person', () => {
  assert.equal(approvalsFor(undefined, 'high'), 1);
  const graded = cfg({ risk: { profile: 'graded' } });
  assert.deepEqual(['low', 'medium', 'high'].map((t) => approvalsFor(graded, t as 'low')), [0, 1, 2]);
  assert.equal(approvalsFor(graded, 'low', 'intent'), 1);
  assert.equal(approvalsFor(cfg({ risk: { profile: 'graded', tiers: { low: { approvals: 1 } } } }), 'low'), 1);
});

test('isTrustedAuthor: explicit list, else everyone in roles, else anyone; never an agent', () => {
  assert.ok(isTrustedAuthor(cfg({}), { name: 'Ana' }));
  assert.ok(!isTrustedAuthor(cfg({}), { name: 'Claude', email: 'noreply@anthropic.com' }));
  const roles = cfg({ roles: { po: ['@ana', 'juan@example.com'] } });
  assert.ok(isTrustedAuthor(roles, { login: 'ana' }));
  assert.ok(!isTrustedAuthor(roles, { name: 'Eve' }));
  assert.ok(isTrustedAuthor(cfg({ roles: { po: ['@ana'] }, risk: { trusted_authors: ['Eve'] } }), { name: 'Eve' }));
  assert.ok(!isTrustedAuthor(cfg({ risk: { trusted_authors: [] } }), { name: 'Ana' }), 'an empty list trusts nobody');
});

function gradedRepo(risk: Record<string, unknown> = {}) {
  const root = repo({ version: 1, risk: { profile: 'graded', high_risk_paths: ['src/auth/**'], ...risk } });
  gitIn(root, 'checkout', '-qb', 'change/claims');
  writeArtifact(root, '2026-11-claims', 'intent', 'accepted', 'author: Ana Product\n');
  writeArtifact(root, '2026-11-claims', 'spec', 'draft', 'author: Ana Product\n');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'artifacts');
  return root;
}

test('graded: a low-risk spec is approved automatically, recorded as sdlc; a person is still refused nothing', () => {
  const root = gradedRepo();
  const loaded = loadConfig(root);
  const r = decideGate(root, loaded, 'claims', 'spec', 'approved', { auto: true });
  assert.equal(r.by, 'sdlc (risk low)');
  const spec = fm(root, '2026-11-claims', 'spec');
  assert.equal(spec.status, 'approved');
  assert.equal(spec.approved_tier, 'low');
  assert.match(spec.approved_sha, /^[0-9a-f]{7,}$/);
  assert.match(gitIn(root, 'log', '-1', '--format=%B'), /Gate: spec approved by sdlc \(risk low\)/);
  assert.throws(() => decideGate(root, loaded, 'claims', 'intent', 'approved', { auto: true }), /intent needs 1 human approval/);
  assert.throws(() => decideGate(root, loadConfig(repo()), 'x', 'spec', 'approved', { auto: true }), /change not found|strict/);
});

test('graded: high risk needs two different people; the gate stays draft after the first', () => {
  const root = gradedRepo();
  writeFileSync(join(root, 'changes/2026-11-claims/spec.md'), '---\nstatus: draft\nauthor: Ana Product\n---\n# Spec\nChanges `src/auth/session.ts`.\n');
  gitIn(root, 'commit', '-qam', 'spec names an auth path');
  const loaded = loadConfig(root);
  assert.throws(() => decideGate(root, loaded, 'claims', 'spec', 'approved', { auto: true }), /needs 2 human approvals at high risk/);
  const first = decideGate(root, loaded, 'claims', 'spec', 'approved', { approver: { name: 'Bob', email: 'bob@example.com' } });
  assert.deepEqual(first.approvals, { have: 1, need: 2 });
  assert.equal(fm(root, '2026-11-claims', 'spec').status, 'draft');
  assert.match(gitIn(root, 'log', '-1', '--format=%B'), /Gate: spec approval by Bob <bob@example.com> \(1\/2, high risk\)/);
  assert.throws(() => decideGate(root, loaded, 'claims', 'spec', 'approved', { approver: { name: 'Bob', email: 'bob@example.com' } }), /already approved/);
  decideGate(root, loaded, 'claims', 'spec', 'approved', { approver: { name: 'Lia', email: 'lia@example.com' } });
  assert.equal(fm(root, '2026-11-claims', 'spec').status, 'approved');
  assert.equal(fm(root, '2026-11-claims', 'spec').approved_by, 'Bob, Lia');
});

test('graded: an approval given at a lower tier opens the gate again when the change grows', () => {
  const root = gradedRepo();
  const loaded = loadConfig(root);
  decideGate(root, loaded, 'claims', 'spec', 'approved', { auto: true });
  const change = getChange(root, 'claims')!;
  assert.deepEqual(artifactGate(change, 'spec', loaded, 'low'), { need: 0, have: 0, ok: true, stale: false });
  assert.deepEqual(artifactGate(change, 'spec', loaded, 'medium'), { need: 1, have: 0, ok: false, stale: true });
  assert.equal(artifactGate(change, 'spec', undefined, 'high').ok, true, 'strict: the status decides');
});

test('graded: automatic approval needs a trusted author', () => {
  const root = gradedRepo({ trusted_authors: ['@someone'] });
  assert.throws(() => decideGate(root, loadConfig(root), 'claims', 'spec', 'approved', { auto: true }), /not in risk.trusted_authors/);
});

test('codeGate: tiers, the director counts once, agents never, and stale approvals after untrusted commits', () => {
  const root = repo({ version: 1, risk: { profile: 'graded', trusted_authors: ['Ana Product', '@ana'] } });
  const head0 = gitIn(root, 'rev-parse', 'HEAD');
  const loaded = loadConfig(root);
  const ana = { login: 'ana', name: 'Ana Product' };
  assert.equal(codeGate(root, loaded, { tier: 'low', head: head0, approvals: [], director: ana }).ok, true);
  assert.equal(codeGate(root, loaded, { tier: 'medium', head: head0, approvals: [], director: ana }).ok, true, 'medium: the trusted director is the one person');
  const high = codeGate(root, loaded, { tier: 'high', head: head0, approvals: [{ login: 'claude[bot]', sha: head0 }], director: ana });
  assert.equal(high.ok, false, 'high: someone other than the director, and not a bot');
  assert.equal(high.have, 1);
  assert.equal(codeGate(root, loaded, { tier: 'high', head: head0, approvals: [{ login: 'lia', sha: head0 }], director: ana }).ok, true);
  const untrusted = codeGate(root, loaded, { tier: 'low', head: head0, approvals: [], director: { login: 'eve' } });
  assert.deepEqual([untrusted.ok, untrusted.need], [false, 1], 'an untrusted author always needs another person');

  writeFileSync(join(root, 'a.txt'), 'by ana\n');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'trusted commit');
  const head1 = gitIn(root, 'rev-parse', 'HEAD');
  assert.ok(vouched(root, loaded, head0, head1), 'a trusted author keeps the approval');
  writeFileSync(join(root, 'a.txt'), 'by the agent\n');
  gitIn(root, 'add', '-A');
  gitIn(root, '-c', 'user.name=claude[bot]', '-c', 'user.email=bot@anthropic.com', 'commit', '-qm', 'agent push');
  const head2 = gitIn(root, 'rev-parse', 'HEAD');
  assert.ok(!vouched(root, loaded, head0, head2));
  const g = codeGate(root, loaded, { tier: 'high', head: head2, approvals: [{ login: 'lia', sha: head0 }], director: ana });
  assert.deepEqual([g.ok, g.stale], [false, ['lia']]);
  assert.ok(!vouched(root, loaded, head2, head0), 'not an ancestor (force-push)');
});
