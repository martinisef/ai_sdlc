// Human time per change, the revert and incident guardrails, and the risk floor the circuit breaker sets.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  changeRisk,
  getChange,
  isRevert,
  loadConfig,
  METRIC_VALUES,
  metrics,
  percentile,
  readRiskFloor,
  RISK_FLOOR_PATH,
  RISK_FLOOR_REF,
  writePrStats,
  writeRiskFloor,
} from '@ai-native-sdlc/core';
import { gitIn, repo, writeArtifact } from './helpers.ts';

const T0 = 1_700_000_000;
const commitAt = (root: string, msg: string, epoch: number) =>
  execFileSync('git', ['commit', '-qm', msg], { cwd: root, env: { ...process.env, GIT_COMMITTER_DATE: `${epoch} +0000`, GIT_AUTHOR_DATE: `${epoch} +0000` } });

function history() {
  const root = repo();
  writeArtifact(root, '2026-11-c1', 'intent', 'draft');
  gitIn(root, 'add', '-A');
  commitAt(root, 'intent', T0);
  writeArtifact(root, '2026-11-c1', 'intent', 'accepted');
  gitIn(root, 'add', '-A');
  commitAt(root, 'chore(c1): approve intent\n\nGate: intent accepted by Bob <bob@example.com>', T0 + 3 * 3600);
  writeArtifact(root, '2026-11-c1', 'spec', 'draft');
  gitIn(root, 'add', '-A');
  commitAt(root, 'spec', T0 + 4 * 3600);
  writeArtifact(root, '2026-11-c1', 'spec', 'approved');
  gitIn(root, 'add', '-A');
  commitAt(root, 'chore(c1): approve spec\n\nGate: spec approved by sdlc (risk low)', T0 + 5 * 3600);
  // a squash commit repeats the trailer in its body: it is not a second approval
  appendFileSync(join(root, 'changes/2026-11-c1/intent.md'), '\nmore\n');
  gitIn(root, 'add', '-A');
  commitAt(root, 'feat: c1 (#3)\n\n* chore(c1): approve intent\n\nGate: intent accepted by Bob <bob@example.com>', T0 + 6 * 3600);
  writeArtifact(root, '2026-11-c2', 'intent', 'draft', 'origin: incident\n');
  gitIn(root, 'add', '-A');
  commitAt(root, 'incident intent', T0 + 7 * 3600);
  writeFileSync(join(root, 'a.txt'), 'x');
  gitIn(root, 'add', '-A');
  commitAt(root, 'feat: x', T0 + 8 * 3600);
  gitIn(root, 'revert', '--no-edit', 'HEAD');
  return root;
}

test('metrics: human approvals and waiting time come from the gate commits; automatic ones do not count', () => {
  const root = history();
  const c1 = metrics(root).changes.find((c) => c.change.endsWith('c1'))!;
  assert.equal(c1.humanApprovals, 1);
  assert.equal(c1.waitingH, 3, 'the intent waited 3 h for Bob; the spec was approved by the tier');
});

test('metrics: revert rate on the default branch and incidents per change', () => {
  const root = history();
  const s = metrics(root).summary;
  assert.equal(s.reverts, 1);
  assert.equal(s.landed, 8, 'every commit before the revert');
  assert.equal(s.revertRate, Math.round((1 / 8) * 1000) / 1000);
  assert.equal(s.incidents, 1);
  assert.equal(s.incidentRate, 1, 'one incident for one other change');
  assert.equal(METRIC_VALUES.reverts(s), 1);
  assert.equal(metrics(root, { since: new Date(Date.now() + 3600_000) }).summary.reverts, 0, 'nothing in a window that starts later');
});

test('metrics: review rounds and human comments come from the PR cache', () => {
  const root = history();
  writePrStats(root, { 'changes/2026-11-c1': { pr: 3, rounds: 2, humanComments: 5 } });
  const m = metrics(root);
  const c1 = m.changes.find((c) => c.change.endsWith('c1'))!;
  assert.deepEqual([c1.pr, c1.reviewRounds, c1.humanComments], [3, 2, 5]);
  assert.deepEqual(m.summary.reviewRounds, { median: 2, p95: 2 });
  assert.equal(METRIC_VALUES.review_rounds_median(m.summary), 2);
});

test('percentile and isRevert', () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([4, 1], 50), 1);
  assert.equal(percentile([], 95), undefined);
  assert.ok(isRevert('Revert "feat: x"'));
  assert.ok(isRevert('undo the export', 'This reverts commit 1a2b3c4d.'));
  assert.ok(!isRevert('feat: revert button'));
});

test('risk floor: raises every change while it lasts, lives in a ref, never lowers, expires', () => {
  const root = repo();
  gitIn(root, 'checkout', '-qb', 'change/x');
  writeArtifact(root, '2026-11-x', 'intent', 'accepted');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'intent');
  const loaded = loadConfig(root);
  const now = new Date('2026-11-03T12:00:00Z');
  assert.equal(changeRisk(root, loaded, getChange(root, 'x')!, { now }).tier, 'low');

  writeRiskFloor(root, { tier: 'medium', until: '2026-11-06T12:00:00.000Z', reason: 'revert_rate out of its band' }, now);
  const r = changeRisk(root, loaded, getChange(root, 'x')!, { now });
  assert.equal(r.tier, 'medium');
  assert.match(r.reasons[0].reason, /circuit breaker until 2026-11-06.*revert_rate/);
  assert.match(gitIn(root, 'cat-file', '-p', `${RISK_FLOOR_REF}:floor.json`), /"tier": "medium"/);

  const kept = writeRiskFloor(root, { tier: 'medium', until: '2026-11-04T00:00:00.000Z', reason: 'shorter' }, now);
  assert.equal(kept.until, '2026-11-06T12:00:00.000Z', 'a shorter floor of the same tier does not replace a longer one');
  assert.equal(writeRiskFloor(root, { tier: 'high', until: '2026-11-04T00:00:00.000Z', reason: 'incidents' }, now).tier, 'high');

  rmSync(join(root, RISK_FLOOR_PATH));
  assert.equal(readRiskFloor(root, now)?.tier, 'high', 'CI has no local file, only the ref');
  assert.equal(readRiskFloor(root, new Date('2026-11-07T00:00:00Z')), undefined, 'expired');
  assert.equal(changeRisk(root, loaded, getChange(root, 'x')!, { now: new Date('2026-11-07T00:00:00Z') }).tier, 'low');
});
