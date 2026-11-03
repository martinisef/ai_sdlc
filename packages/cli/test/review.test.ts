import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blocking, changedLines, encodeState, ours, parseFindings, parseJsonArray, resolutions, reviewVerdict, sameFinding, stateFrom, tally, type StoredFinding } from '../src/ci/review.ts';

test('parseJsonArray: fenced block, bare array, or nothing', () => {
  assert.deepEqual(parseJsonArray('Here:\n```json\n[{"a":1}]\n```\nbye'), [{ a: 1 }]);
  assert.deepEqual(parseJsonArray('noise [1, 2] more'), [1, 2]);
  assert.equal(parseJsonArray('no findings'), undefined);
});

test('parseFindings: keeps well-formed findings with file:line, normalizes severity and paths', () => {
  const out = JSON.stringify([
    { severity: 'Pre-existing', file: './src/a.ts', line: 4, title: 'x', bug_class: 'Race Condition' },
    { severity: 'important', file: 'src/b.ts', title: 'no line' },
    { severity: 'blocker', file: 'src/c.ts', line: 1, title: 'unknown severity' },
  ]);
  const fs = parseFindings(out, 'bugs');
  assert.equal(fs.length, 1);
  assert.deepEqual(fs[0], { severity: 'pre_existing', file: 'src/a.ts', line: 4, title: 'x', evidence: '', bug_class: 'race condition', pass: 'bugs' });
  assert.equal(parseFindings(JSON.stringify([{ severity: 'nit', file: 'a', line: 1, title: 't', pass: 'Security' }]), 'all')[0].pass, 'security');
});

test('sameFinding: same file and bug class nearby, or the same title', () => {
  const a = { file: 'src/a.ts', line: 10, title: 'Off by one', bug_class: 'off-by-one' };
  assert.ok(sameFinding(a, { ...a, line: 13, title: 'loop bound' }));
  assert.ok(sameFinding(a, { ...a, line: 90, bug_class: 'other', title: 'off-by-one!' }));
  assert.ok(!sameFinding(a, { ...a, line: 40, title: 'loop bound' }));
  assert.ok(!sameFinding(a, { ...a, file: 'src/b.ts' }));
});

test('changedLines: new-side lines of each hunk', () => {
  const diff = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,3 @@\n@@ -10 +11 @@\ndiff --git a/y b/y\n--- a/y\n+++ /dev/null\n@@ -1 +0,0 @@\n';
  const m = changedLines(diff);
  assert.deepEqual([...(m.get('x') ?? [])], [1, 2, 3, 11]);
  assert.equal(m.has('y'), false);
});

test('tally: majority of the ballots that voted; severity from the ayes', () => {
  const b = [
    [{ id: 'f1', vote: 'keep', severity: 'nit' as const }],
    [{ id: 'f1', vote: 'keep', severity: 'nit' as const }],
    [{ id: 'f1', vote: 'drop' }],
  ];
  assert.deepEqual(tally(b, 'f1', 'keep'), { pass: true, severity: 'nit' });
  assert.equal(tally(b.slice(1), 'f1', 'keep').pass, false, 'a tie drops');
  assert.deepEqual(tally(b, 'f9', 'keep'), { pass: true }, 'no ballot: the finding stands');
});

test('stateFrom: the last state from a bot or maintainer', () => {
  const st = (round: number) => encodeState({ round, sha: 'abc', findings: [] });
  const c = (author: string, association: string | undefined, round: number) => ({ id: String(round), author, association, body: st(round), createdAt: `2026-11-0${round}` });
  assert.equal(stateFrom([c('github-actions[bot]', 'NONE', 1), c('ana', 'MEMBER', 2), c('mallory', 'CONTRIBUTOR', 3)])?.round, 2);
  assert.ok(ours({ id: '1', author: 'gitlab-user', body: '', createdAt: '' }), 'GitLab and Bitbucket have no association');
});

const finding = (id: string, severity: StoredFinding['severity'], status: StoredFinding['status'] = 'open'): StoredFinding => ({ id, severity, file: 'src/a.ts', line: 1, title: id, evidence: '', bug_class: 'x', pass: 'bugs', status, round: 1 });

test('resolutions: a reason is required; inline replies point at the finding; agents, bots and contributors cannot resolve', () => {
  const c = (id: string, author: string, body: string, extra: object = {}) => ({ id, author, body, createdAt: id, association: 'MEMBER', ...extra });
  const thread = [
    c('1', 'github-actions[bot]', '<!-- sdlc:finding id=f1 -->', { association: 'NONE', path: 'src/a.ts', line: 1 }),
    c('2', 'ana', 'Resolved: intended, documented in the spec', { replyTo: '1' }),
    c('3', 'ana', 'resolved f2, s1: false positive'),
    c('4', 'ana', 'resolved:'),
    c('5', 'mallory', 'resolved f3: nope', { association: 'CONTRIBUTOR' }),
    c('6', 'claude[bot]', 'resolved f4: done'),
  ];
  const r = resolutions(thread, undefined);
  assert.deepEqual([...r.keys()].sort(), ['f1', 'f2', 's1']);
  assert.deepEqual(r.get('f1'), { id: 'f1', by: 'ana', reason: 'intended, documented in the spec' });
  const gl = [{ id: '9', author: 'bob', body: 'resolved f5: fine', createdAt: '9' }];
  assert.equal(resolutions(gl, { config: { version: 1, roles: { 'tech-lead': ['@ana'] } } } as never).size, 0, 'without an association: trusted authors only');
});

test('blocking and reviewVerdict: Important blocks, security blocks unless pre-existing; stale reviews are pending', () => {
  assert.deepEqual(blocking('review', [finding('f1', 'important'), finding('f2', 'nit'), finding('f3', 'important', 'fixed')]).map((f) => f.id), ['f1']);
  assert.deepEqual(blocking('security', [finding('s1', 'nit'), finding('s2', 'pre_existing')]).map((f) => f.id), ['s1']);
  const review = { round: 1, sha: 'aaa', findings: [finding('f1', 'important')] };
  assert.equal(reviewVerdict({ review }, new Map(), 'aaa').state, 'failure');
  assert.equal(reviewVerdict({ review }, new Map([['f1', { id: 'f1', by: 'ana', reason: 'ok' }]]), 'aaa').state, 'success');
  assert.deepEqual(reviewVerdict({ review: { ...review, findings: [] } }, new Map(), 'bbb'), { state: 'pending', description: 'waiting for the review of bbb' });
});
