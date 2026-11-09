import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import {
  applyRoadmap,
  approvalHolds,
  checkRoadmap,
  decideRoadmap,
  findRoadmapItem,
  getRoadmap,
  listChanges,
  loadConfig,
  newRoadmap,
  nextStory,
  parseRoadmap,
  roadmapStatus,
  setAnswers,
  type CreateIssue,
  type Tracker,
} from '../src/index.ts';
import { gitIn, repo, writeArtifact } from './helpers.ts';

const ROADMAP = `---
roadmap: payments
status: draft
author: Ana Product
source: changes/_roadmaps/payments/source.pdf
---
# Roadmap: Payments v2

Card payments for the checkout.

## E1 · Checkout API

The endpoints the web checkout calls.

### E1.S1 · Create a payment
- risk: medium
- depends: E1.S2
- source: §3.2
- labels: api

Creates a payment for an order.

Acceptance criteria:
- [ ] POST /payments returns 201 with the payment id
- [ ] An order can only be paid once

### E1.S2 · Payment model
- risk: low
- depends: -

Acceptance criteria:
- [ ] The payments table exists with a migration

## E2 · Refunds

### E2.S1 · Full refund
- depends: E1.S1

Acceptance criteria:
- [ ] POST /payments/:id/refund refunds the whole amount

## Open questions
- Q1: Which currencies at launch?
  A: USD only.
- Q2: Partial refunds in v1?
  A: No, full refunds only.
`;

function setup(raw = ROADMAP, config: object = { version: 1, locale: 'en' }) {
  const root = repo(config);
  mkdirSync(join(root, 'changes/_roadmaps/payments'), { recursive: true });
  writeFileSync(join(root, 'changes/_roadmaps/payments/roadmap.md'), raw);
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'roadmap: payments');
  return root;
}

function fakeTracker(o: { failOn?: number; provider?: Tracker['provider'] } = {}) {
  const created: (CreateIssue & { key: string })[] = [];
  const links: [string, string][] = [];
  let n = 100;
  const t = {
    provider: o.provider ?? 'jira',
    async create(c: CreateIssue) {
      if (o.failOn && created.length + 1 === o.failOn) throw new Error('HTTP 500 boom');
      const key = `PAY-${++n}`;
      created.push({ ...c, key });
      return key;
    },
    async link(a: string, b: string) {
      links.push([a, b]);
    },
  } as unknown as Tracker;
  return { t, created, links };
}

test('parse: epics, stories, fields, criteria, dependencies and questions', () => {
  const r = parseRoadmap(ROADMAP, 'payments');
  assert.equal(r.title, 'Payments v2');
  assert.deepEqual(
    r.items.map((i) => [i.id, i.kind, i.epic ?? '-']),
    [
      ['E1', 'epic', '-'],
      ['E1.S1', 'story', 'E1'],
      ['E1.S2', 'story', 'E1'],
      ['E2', 'epic', '-'],
      ['E2.S1', 'story', 'E2'],
    ],
  );
  const s = r.items[1];
  assert.deepEqual(s.fields, { risk: 'medium', depends: 'E1.S2', source: '§3.2', labels: 'api' });
  assert.deepEqual(s.criteria, ['POST /payments returns 201 with the payment id', 'An order can only be paid once']);
  assert.equal(s.description, 'Creates a payment for an order.');
  assert.deepEqual(r.items[2].depends, [], '"-" means no dependencies');
  assert.equal(s.line, 15, 'line numbers count the frontmatter');
  assert.deepEqual(r.questions, [
    { id: 'Q1', text: 'Which currencies at launch?', answer: 'USD only.' },
    { id: 'Q2', text: 'Partial refunds in v1?', answer: 'No, full refunds only.' },
  ]);
  assert.deepEqual(checkRoadmap(r), { errors: [], warnings: [], epics: 2, stories: 3, open: 0 });
});

test('check: what blocks an approval, and what only warns', () => {
  const bad = ROADMAP.replace('- depends: E1.S2', '- depends: E9.S9')
    .replace('- [ ] The payments table exists with a migration', 'no criteria here')
    .replace('### E2.S1 · Full refund', '### E3.S1 · Full refund\n- risk: huge')
    .replace('  A: No, full refunds only.', '  A:');
  const c = checkRoadmap(parseRoadmap(bad, 'payments'));
  assert.ok(c.errors.some((e) => /E1\.S1.*depends on E9\.S9, which does not exist/.test(e)), c.errors.join('\n'));
  assert.ok(c.errors.some((e) => /E1\.S2.*no acceptance criteria/.test(e)));
  assert.ok(c.errors.some((e) => /E3\.S1.*not under its epic/.test(e)));
  assert.ok(c.errors.some((e) => /E3\.S1.*risk must be low, medium or high/.test(e)));
  assert.ok(c.errors.some((e) => /Q2 has no answer/.test(e)));
  assert.equal(c.open, 1);
  const empty = checkRoadmap(parseRoadmap(ROADMAP.replace('## Open questions', '## E3 · Later\n\n## Open questions'), 'payments'));
  assert.deepEqual(empty.errors, []);
  assert.ok(empty.warnings.some((w) => /E3 .*epic without stories/.test(w)), empty.warnings.join('\n'));

  const cycle = checkRoadmap(parseRoadmap(ROADMAP.replace('- depends: -', '- depends: E2.S1'), 'payments'));
  assert.ok(cycle.errors.some((e) => /dependency cycle: E1\.S1 → E1\.S2 → E2\.S1 → E1\.S1/.test(e)), cycle.errors.join('\n'));

  const big = ROADMAP.replace('- [ ] An order can only be paid once', Array.from({ length: 8 }, (_, i) => `- [ ] rule ${i}`).join('\n'));
  assert.ok(checkRoadmap(parseRoadmap(big, 'payments')).warnings.some((w) => /E1\.S1.*9 acceptance criteria/.test(w)));
});

test('setAnswers fills the answers and keeps the rest of the file', () => {
  const open = ROADMAP.replace('  A: USD only.', '  A:').replace('  A: No, full refunds only.\n', '');
  assert.equal(checkRoadmap(parseRoadmap(open)).open, 2);
  const answered = setAnswers(open, { Q1: 'USD and EUR', Q2: 'Not in v1' });
  assert.deepEqual(
    parseRoadmap(answered).questions.map((q) => q.answer),
    ['USD and EUR', 'Not in v1'],
  );
  assert.equal(answered.split('## Open questions')[0], open.split('## Open questions')[0]);
});

test('new: copies the source, writes the template, refuses unknown formats', async () => {
  const root = repo();
  writeFileSync(join(root, 'plan.pdf'), '%PDF-1.4 fake');
  const r = await newRoadmap(root, 'billing', { source: join(root, 'plan.pdf'), loaded: loadConfig(root) });
  assert.equal(r.source, 'changes/_roadmaps/billing/source.pdf');
  assert.equal(readFileSync(join(root, r.source!), 'utf8'), '%PDF-1.4 fake');
  const created = getRoadmap(root, 'billing');
  assert.equal(created.data.status, 'draft');
  assert.equal(created.data.author, 'Ana Product');
  assert.equal(created.questions[0].id, 'Q1');
  await assert.rejects(newRoadmap(root, 'billing'), /already exists/);
  writeFileSync(join(root, 'plan.docx'), 'x');
  await assert.rejects(newRoadmap(root, 'other', { source: join(root, 'plan.docx') }), /export Word or Google Docs to PDF/);
  assert.equal((await newRoadmap(root, 'wiki', { source: 'https://wiki.example.com/plan' })).source, 'https://wiki.example.com/plan');
  assert.equal(listChanges(root).length, 0, 'roadmaps are not changes');
});

test('new: a Google Doc link is downloaded as Markdown; private docs fail before anything is written', async () => {
  const root = repo();
  const asked: string[] = [];
  const fake = (async (u: string) => {
    asked.push(String(u));
    if (String(u).includes('/d/private/')) return new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (String(u).includes('/d/gone/')) return new Response('not found', { status: 404 });
    return new Response('# Plan\n![][image1]\n\n[image1]: <data:image/png;base64,iVBORw0KGgo=>\n', { headers: { 'content-type': 'text/x-markdown' } });
  }) as typeof fetch;
  const url = 'https://docs.google.com/document/u/1/d/1AbC_d-9/edit?tab=t.0';
  const r = await newRoadmap(root, 'billing', { source: url, fetch: fake });
  assert.deepEqual(asked, ['https://docs.google.com/document/d/1AbC_d-9/export?format=md']);
  assert.equal(r.source, 'changes/_roadmaps/billing/source.md');
  assert.equal(readFileSync(join(root, r.source), 'utf8'), '# Plan\n![][image1]\n\n[image1]: <image omitted>\n');
  assert.equal(getRoadmap(root, 'billing').data.source_url, url);
  await assert.rejects(newRoadmap(root, 'secret', { source: 'https://docs.google.com/document/d/private/edit', fetch: fake }), /Anyone with the link/);
  await assert.rejects(newRoadmap(root, 'gone', { source: 'https://docs.google.com/document/d/gone/edit', fetch: fake }), /HTTP 404/);
  assert.equal(existsSync(join(root, 'changes/_roadmaps/secret')), false);
});

test('new: a PDF also gets a source.txt when pdftotext is installed', async () => {
  const root = repo();
  const bin = mkdtempSync(join(tmpdir(), 'sdlc-pdftotext-'));
  writeFileSync(join(bin, 'pdftotext'), `#!/bin/sh\nprintf 'Plan text' > "$3"\n`);
  chmodSync(join(bin, 'pdftotext'), 0o755);
  writeFileSync(join(root, 'plan.pdf'), '%PDF-1.4 fake');
  const path = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${path}`;
  try {
    await newRoadmap(root, 'billing', { source: join(root, 'plan.pdf') });
  } finally {
    process.env.PATH = path;
  }
  assert.equal(readFileSync(join(root, 'changes/_roadmaps/billing/source.txt'), 'utf8'), 'Plan text');
  writeFileSync(join(root, 'plan.md'), '# Plan');
  await newRoadmap(root, 'md', { source: join(root, 'plan.md') });
  assert.equal(existsSync(join(root, 'changes/_roadmaps/md/source.txt')), false);
});

test('decide: a person approves a roadmap that passes the check; edits after that need a new approval', () => {
  const root = setup();
  const loaded = loadConfig(root);
  assert.throws(() => decideRoadmap(root, loaded, 'payments', 'approved', { approver: { name: 'Claude', email: 'noreply@anthropic.com' } }), /looks like an agent or bot/);

  const broken = setup(ROADMAP.replace('  A: USD only.', '  A:'));
  assert.throws(() => decideRoadmap(broken, loadConfig(broken), 'payments', 'approved'), /does not pass the check[\s\S]*Q1 has no answer/);
  assert.equal(decideRoadmap(broken, loadConfig(broken), 'payments', 'rejected', { comment: 'answer Q1' }).decision, 'rejected', 'rejecting needs no check');

  const d = decideRoadmap(root, loaded, 'payments', 'approved', { comment: 'looks right' });
  assert.equal(d.by, 'Ana Product');
  const r = getRoadmap(root, 'payments');
  assert.equal(r.data.status, 'approved');
  assert.match(r.data.approved_hash, /^[0-9a-f]{16}$/);
  assert.match(gitIn(root, 'log', '-1', '--format=%B'), /^chore\(roadmap-payments\): approve roadmap\n\nlooks right\n\nGate: roadmap approved by Ana Product <ana@example.com>/);
  assert.equal(gitIn(root, 'status', '--porcelain', '--', 'changes'), '');
  assert.deepEqual(approvalHolds(r), { ok: true });

  const path = join(root, 'changes/_roadmaps/payments/roadmap.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace('### E1.S1 · Create a payment\n', '### E1.S1 · Create a payment\n- key: PAY-1\n'));
  assert.deepEqual(approvalHolds(getRoadmap(root, 'payments')), { ok: true }, 'keys do not invalidate the approval');
  writeFileSync(path, readFileSync(path, 'utf8').replace('An order can only be paid once', 'An order can be paid twice'));
  assert.match(approvalHolds(getRoadmap(root, 'payments')).reason!, /changed after it was approved/);
});

test('decide: gates.roadmap limits who approves', () => {
  const root = setup(ROADMAP, { version: 1, gates: { roadmap: ['tech-lead'] }, roles: { 'tech-lead': ['bo@example.com'] } });
  assert.throws(() => decideRoadmap(root, loadConfig(root), 'payments', 'approved'), /roadmap needs approval from: tech-lead/);
  assert.equal(decideRoadmap(root, loadConfig(root), 'payments', 'approved', { approver: { name: 'Bo', email: 'bo@example.com' } }).by, 'Bo');
});

test('apply: refuses a draft; dry run lists the work; creates epics, stories under them, then links; reruns are no-ops', async () => {
  const root = setup();
  const loaded = loadConfig(root);
  await assert.rejects(applyRoadmap(root, loaded, 'payments', { tracker: () => fakeTracker().t }), /is draft; a person approves it first/);
  decideRoadmap(root, loaded, 'payments', 'approved');

  const dry = await applyRoadmap(root, loaded, 'payments', { dryRun: true });
  assert.deepEqual(
    dry.actions.map((a) => `${a.kind} ${a.id}`),
    ['create-epic E1', 'create-story E1.S1', 'create-story E1.S2', 'create-epic E2', 'create-story E2.S1', 'link E1.S1', 'link E2.S1'],
  );
  assert.equal(gitIn(root, 'status', '--porcelain', '--', 'changes'), '', 'a dry run writes nothing');

  const f = fakeTracker();
  const res = await applyRoadmap(root, loaded, 'payments', { tracker: () => f.t });
  assert.deepEqual([res.created, res.linked], [5, 2]);
  assert.deepEqual(
    f.created.map((c) => [c.key, c.summary, c.type ?? '-', c.parent ?? '-']),
    [
      ['PAY-101', 'Checkout API', 'Epic', '-'],
      ['PAY-102', 'Create a payment', '-', 'PAY-101'],
      ['PAY-103', 'Payment model', '-', 'PAY-101'],
      ['PAY-104', 'Refunds', 'Epic', '-'],
      ['PAY-105', 'Full refund', '-', 'PAY-104'],
    ],
  );
  assert.deepEqual(f.created[1].labels, ['api']);
  assert.match(f.created[1].body, /Creates a payment for an order\.\n\nAcceptance criteria:\n- POST \/payments returns 201/);
  assert.match(f.created[1].body, /Roadmap: changes\/_roadmaps\/payments\/roadmap\.md \(E1\.S1\)\nSource: §3\.2 · changes\/_roadmaps\/payments\/source\.pdf\nRisk: medium/);
  assert.deepEqual(f.links, [
    ['PAY-103', 'PAY-102'],
    ['PAY-102', 'PAY-105'],
  ]);
  const r = getRoadmap(root, 'payments');
  assert.equal(r.items.find((i) => i.id === 'E1.S1')!.fields.key, 'PAY-102');
  assert.equal(r.items.find((i) => i.id === 'E1.S1')!.fields.links, 'E1.S2');
  assert.deepEqual(approvalHolds(r), { ok: true });
  assert.match(gitIn(root, 'log', '-1', '--format=%s'), /^chore\(roadmap-payments\): 5 tickets created, 2 links$/);
  assert.equal(gitIn(root, 'status', '--porcelain', '--', 'changes'), '');

  const again = fakeTracker();
  const rerun = await applyRoadmap(root, loaded, 'payments', { tracker: () => again.t });
  assert.deepEqual([rerun.actions.length, again.created.length, again.links.length], [0, 0, 0]);
});

test('apply: a failure halfway keeps what was created, and the rerun continues without duplicates', async () => {
  const root = setup();
  const loaded = loadConfig(root);
  decideRoadmap(root, loaded, 'payments', 'approved');
  const first = fakeTracker({ failOn: 3 });
  await assert.rejects(applyRoadmap(root, loaded, 'payments', { tracker: () => first.t }), /HTTP 500 boom\n2 tickets and 0 links were created and saved/);
  assert.match(gitIn(root, 'log', '-1', '--format=%s'), /2 tickets created, 0 links \(partial\)/);
  const second = fakeTracker();
  const res = await applyRoadmap(root, loaded, 'payments', { tracker: () => second.t });
  assert.deepEqual(
    second.created.map((c) => [c.summary, c.parent ?? '-']),
    [
      ['Payment model', 'PAY-101'],
      ['Refunds', '-'],
      ['Full refund', 'PAY-102'],
    ],
  );
  assert.equal(res.linked, 2);
});

test('status, next story and find: stories follow their tickets through the loop', async () => {
  const root = setup();
  const loaded = loadConfig(root);
  assert.equal(nextStory(root, loaded), undefined, 'nothing before approval');
  decideRoadmap(root, loaded, 'payments', 'approved');
  await applyRoadmap(root, loaded, 'payments', { tracker: () => fakeTracker().t });

  // E1.S2 (PAY-103) has no dependencies; E1.S1 waits for it, E2.S1 waits for E1.S1
  assert.equal(nextStory(root, loaded)?.key, 'PAY-103');
  const st = roadmapStatus(root, loaded, 'payments');
  assert.deepEqual(
    st.map((s) => [s.id, s.key, s.blockedBy.join(',') || '-']),
    [
      ['E1.S1', 'PAY-102', 'E1.S2'],
      ['E1.S2', 'PAY-103', '-'],
      ['E2.S1', 'PAY-105', 'E1.S1'],
    ],
  );
  writeArtifact(root, '2026-11-PAY-103-payment-model', 'intent', 'draft', 'ticket: PAY-103\n');
  const withChange = roadmapStatus(root, loaded).find((s) => s.key === 'PAY-103')!;
  assert.equal(withChange.change, 'changes/2026-11-PAY-103-payment-model');
  assert.equal(nextStory(root, loaded), undefined, 'the only unblocked story already has a change');

  const found = findRoadmapItem(root, 'pay-102');
  assert.equal(found?.item.id, 'E1.S1');
  assert.equal(found?.roadmap.slug, 'payments');
  assert.equal(findRoadmapItem(root, 'PAY-999'), undefined);
});
