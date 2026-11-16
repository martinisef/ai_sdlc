import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  addSource,
  appendChange,
  dateFromName,
  discoveryStatus,
  followupDraft,
  loadConfig,
  loadDiscovery,
  parseTickets,
  parseTopic,
  renderStatus,
  replaceTableRows,
  searchDiscovery,
  seedDiscovery,
  statusKey,
  topicTemplate,
  unmergedBranches,
  validateDiscovery,
  writeStatus,
  type Tracker,
} from '../src/index.ts';
import { gitIn, repo } from './helpers.ts';

const DIR = 'changes/_discovery';

const SOURCES = `# Sources

| Date | Source | Type | File | SHA-256 |
|---|---|---|---|---|
| 2026-02-02 | Kickoff | client | transcripts/2026-02-02-kickoff.md | aaa |
| 2026-02-16 | Weekly review | client | transcripts/2026-02-16-weekly-review.md | bbb |
| 2026-03-02 | Weekly review 2 | client | transcripts/2026-03-02-weekly-review-2.md | ccc |
`;

const BOOKINGS = `---
topic: bookings
title: Bookings
created: 2026-02-02
---
# Bookings

<!-- a comment with | pipes | that is not a table -->

## Features
| ID | Feature | Status | Repo | Ticket | Blocked by | Evidence |
|---|---|---|---|---|---|---|
| F1 | Cancel a booking up to 24 h before | in progress | partial | SHOP-12 | | 2026-02-02 Kickoff · 12:40 · Laura: "they must cancel alone" |
| F2 | Refund to the original card | requested | missing | no ticket | Q1 | 2026-02-16 Weekly review · Laura: "refund the card" |
| F3 | Export bookings to CSV | done | exists | ~SHOP-30 | | 2026-02-02 Kickoff · Tom: "we have CSV" |
| F4 | Loyalty points | out of scope | not verified | not verified | | 2026-02-16 Weekly review · Laura: "not this year" |

## Action items
| ID | Action | Owner | Status | Evidence |
|---|---|---|---|---|
| A1 | Send the refund policy | Client: Laura | scheduled | 2026-02-16 Weekly review · Laura: "I'll send it" |
| A2 | Estimate F2 | Team: Martín | open | 2026-02-16 Weekly review · Martín: "we estimate" |

## Decisions
| ID | Decision | Status | Evidence |
|---|---|---|---|
| D1 | Refunds only by card | superseded by D2 | 2026-02-02 Kickoff · Laura: "card only" |
| D2 | Refunds by card or credit | active | 2026-03-02 Weekly review 2 · Laura: "credit too" |

## Questions
| ID | Question | To | Status | Since | Answer | Evidence |
|---|---|---|---|---|---|---|
| Q1 | Partial refunds allowed? | Client: Laura | open | 2026-02-02 | | 2026-02-02 Kickoff · Tom: "partial?" |
| Q2 | Which payment gateway? | Client: Laura | answered | 2026-02-02 | Stripe | 2026-02-16 Weekly review · Laura: "Stripe" |
| Q3 | Max cancellations per month? | Client: Laura | contradiction | 2026-03-02 | | 2026-03-02 Weekly review 2 · Laura: "three" <br> 2026-03-02 Weekly review 2 · Ken: "no limit" |

## Risks
| ID | Risk | Status | Evidence |
|---|---|---|---|
| R1 | Gateway fees on refunds | active | 2026-02-16 Weekly review · Tom: "fees" |

## Changes
- 2026-02-02 Kickoff: F1, F3, D1, Q1, Q2 added
- 2026-02-16 Weekly review: F2, F4, A1, A2, R1 added; Q2 answered
`;

const RESERVAS_ES = `---
topic: reservas
title: Reservas
created: 2026-03-02
---
# Reservas

## Features
| ID | Feature | Estado | Repo | Ticket | Bloqueado por | Evidencia |
|---|---|---|---|---|---|---|
| F1 | Reservar desde el celular | reimplementar | ya existe | SHOP-7 | | 2026-03-02 Weekly review 2 · Laura: "la app vieja no sirve" · motivo: la UI actual no es mobile |

## Preguntas
| ID | Pregunta | Para | Estado | Desde | Respuesta | Evidencia |
|---|---|---|---|---|---|---|
| Q1 | ¿Hace falta app nativa? | Cliente: Ken | abierta | 2026-03-02 | | 2026-03-02 Weekly review 2 · Martín: "¿nativa?" |

## Cambios
- 2026-03-02 Weekly review 2: F1, Q1 nuevas
`;

function project(config: object = { version: 1, locale: 'en', discovery: { team: ['Martín Gómez', 'Tom'] } }) {
  const root = repo(config);
  mkdirSync(join(root, DIR, 'topics'), { recursive: true });
  mkdirSync(join(root, DIR, 'transcripts'), { recursive: true });
  writeFileSync(join(root, DIR, '_sources.md'), SOURCES);
  for (const f of ['2026-02-02-kickoff.md', '2026-02-16-weekly-review.md', '2026-03-02-weekly-review-2.md']) writeFileSync(join(root, DIR, 'transcripts', f), `transcript ${f}\n`);
  writeFileSync(join(root, DIR, 'topics/bookings.md'), BOOKINGS);
  writeFileSync(join(root, DIR, 'topics/reservas.md'), RESERVAS_ES);
  return root;
}

const check = (root: string) => validateDiscovery(root, loadConfig(root));
const edit = (root: string, file: string, from: string | RegExp, to: string) => {
  const p = join(root, DIR, file);
  writeFileSync(p, readFileSync(p, 'utf8').replace(from, to));
};

test('topics parse in English and Spanish into the same canonical rows', () => {
  const t = parseTopic(RESERVAS_ES, 'reservas');
  assert.deepEqual(t.problems, []);
  assert.equal(t.rows[0].status, 'reimplement');
  assert.equal(t.rows[1].table, 'questions');
  assert.equal(t.rows[1].cells.to, 'Cliente: Ken');
  assert.equal(statusKey('questions', 'Contradiccion'), 'contradiction');
  assert.equal(statusKey('decisions', 'reemplazada por D4'), 'superseded');
  assert.equal(statusKey('features', 'doing'), undefined);
  assert.deepEqual(parseTickets('SHOP-1, ~acme/web#4'), { none: false, unverified: false, keys: [{ key: 'SHOP-1', confirmed: true }, { key: 'acme/web#4', confirmed: false }], invalid: [] });
  assert.equal(parseTopic(BOOKINGS, 'bookings').rows.length, 12, 'the commented pipes are not a table');
});

test('the generated template parses clean in both locales', () => {
  for (const locale of ['en', 'es'] as const) {
    const t = parseTopic(topicTemplate({ slug: 'x', title: 'X', created: '2026-01-01', locale }), 'x');
    assert.deepEqual(t.problems, []);
    assert.equal(t.data.topic, 'x');
  }
  for (const locale of ['en', 'es']) {
    const raw = readFileSync(new URL(`../../../content/${locale}/skills/sdlc-discovery/templates/topic.md`, import.meta.url), 'utf8');
    assert.deepEqual(parseTopic(raw, '<topic>').problems, [], `${locale} template`);
  }
});

test('a consistent discovery validates with no errors', () => {
  const root = project();
  writeStatus(root, loadConfig(root));
  const c = check(root);
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.warnings, []);
  assert.equal(c.topics, 2);
  assert.equal(c.sources, 3);
});

test('validate catches the broken rules, one message each', () => {
  const root = project();
  edit(root, 'topics/bookings.md', '| in progress | partial | SHOP-12 |', '| doing | partial | SHOP-12 |');
  edit(root, 'topics/bookings.md', '| F3 | Export bookings to CSV | done | exists | ~SHOP-30 |', '| F3 | Export bookings to CSV | done | partial | ~SHOP-30 |');
  edit(root, 'topics/bookings.md', '| no ticket | Q1 |', '| no ticket | Q2 |');
  edit(root, 'topics/bookings.md', 'Client: Laura | scheduled', 'Laura | scheduled');
  edit(root, 'topics/bookings.md', '| A2 | Estimate F2 | Team: Martín |', '| A2 | Estimate F2 | Client: Tom |');
  edit(root, 'topics/bookings.md', '2026-02-16 Weekly review · Tom: "fees"', '2026-01-01 Lunch · Tom: "fees"');
  edit(root, 'topics/reservas.md', ' · motivo: la UI actual no es mobile', '');
  const msgs = check(root);
  const has = (re: RegExp) => assert.ok(msgs.errors.some((e) => re.test(e)) || msgs.warnings.some((w) => re.test(w)), `${re} in\n${[...msgs.errors, ...msgs.warnings].join('\n')}`);
  has(/F1: status 'doing' is not one of/);
  has(/F3 is done: needs Repo 'exists' or a confirmed ticket/);
  has(/F2 is still blocked by bookings#Q2, which is answered/);
  has(/A1: 'Laura' must start with Team: or Client:/);
  has(/A2: Tom is on the team/);
  has(/R1 cites '2026-01-01 Lunch', which is not in _sources.md/);
  has(/reservas.md:\d+: F1 is reimplement: add `reason: …`/);
  assert.equal(msgs.errors.length, 6, msgs.errors.join('\n'));
});

test('rows, Changes lines, topics and sources committed at HEAD cannot be removed', () => {
  const root = project();
  writeStatus(root, loadConfig(root));
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'discovery');
  edit(root, 'topics/bookings.md', /^\| F4 .*\n/m, '');
  edit(root, 'topics/bookings.md', '; Q2 answered', '');
  edit(root, '_sources.md', /^\| 2026-02-02 .*\n/m, '');
  const errors = check(root).errors;
  assert.ok(errors.some((e) => /F4 was deleted/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /Changes line was edited or removed/.test(e)));
  assert.ok(errors.some((e) => /'2026-02-02 Kickoff' was removed/.test(e)));
  gitIn(root, 'rm', '-q', `${DIR}/topics/reservas.md`);
  assert.ok(check(root).errors.some((e) => /reservas.md: the topic was deleted/.test(e)));
});

test('STATUS.md is deterministic, in the project locale, and flags stale questions', () => {
  const root = project();
  const d = loadDiscovery(root, loadConfig(root));
  const s = discoveryStatus(d);
  assert.deepEqual(s.todo.map((i) => i.ref), ['bookings#F1', 'bookings#F2', 'reservas#F1']);
  assert.deepEqual(s.questions.map((q) => q.ref), ['bookings#Q1', 'bookings#Q3', 'reservas#Q1']);
  assert.equal(s.questions[0].silentFor, 2);
  assert.deepEqual(Object.keys(s.byRecipient), ['Client: Laura', 'Client: Ken']);
  const md = renderStatus(s, 'en');
  assert.equal(md, renderStatus(discoveryStatus(loadDiscovery(root, loadConfig(root))), 'en'));
  assert.match(md, /\*\*Last source:\*\* 2026-03-02 Weekly review 2 · 3 sources processed/);
  assert.match(md, /- bookings#F2 \[requested · missing\] Refund to the original card — blocked by Q1/);
  assert.match(md, /- reservas#F1 \[reimplement · exists · SHOP-7\]/);
  assert.match(md, /- 2026-02-02 · bookings#Q1 Partial refunds allowed\? → Client: Laura · no news in 2 meetings/);
  assert.match(md, /bookings#Q3 \*\*\(contradiction\)\*\*/);
  assert.match(md, /- \*\*Client: Laura\*\*\n {2}- bookings#A1 \[scheduled\]/);
  assert.match(md, /\*\*Out of scope:\*\* bookings#F4/);
  assert.match(renderStatus(s, 'es'), /- reservas#F1 \[reimplementar · ya existe · SHOP-7\]/);
  assert.match(renderStatus(s, 'es'), /Cliente: Laura/);
  assert.match(check(root).warnings.join('\n'), /STATUS.md is out of date/);
});

test('search finds rows by words, accents and case ignored', () => {
  const root = project();
  const hits = searchDiscovery(loadDiscovery(root, loadConfig(root)), 'REFUND original card');
  assert.equal(hits[0].ref, 'bookings#F2');
  assert.equal(searchDiscovery(loadDiscovery(root, loadConfig(root)), 'celular')[0].ref, 'reservas#F1');
  assert.deepEqual(searchDiscovery(loadDiscovery(root, loadConfig(root)), 'a'), []);
});

test('the follow-up lists the client side: new questions, reminders and their action items', () => {
  const root = project();
  const f = followupDraft(loadDiscovery(root, loadConfig(root)), 'en');
  assert.equal(f.path, `${DIR}/followups/2026-03-02-weekly-review-2.md`);
  assert.match(f.body, /## For Client: Laura\n\n\*\*New questions\*\*\n\n1\. Max cancellations per month\? \(bookings#Q3\)/);
  assert.match(f.body, /\*\*Still pending\*\*\n\n1\. Partial refunds allowed\? — pending since 2026-02-02 \(bookings#Q1\)/);
  assert.match(f.body, /\*\*Agreed on your side\*\*\n\n- Send the refund policy \(bookings#A1\)/);
  assert.doesNotMatch(f.body, /Estimate F2/, 'team action items stay out');
  assert.match(followupDraft(loadDiscovery(root, loadConfig(root)), 'es').body, /## Para Cliente: Ken/);
});

test('add registers a transcript once, in date order, and refuses older ones unless forced', () => {
  const root = repo({ version: 1, locale: 'es', discovery: { commit_transcripts: false } });
  const loaded = loadConfig(root);
  const tmp = join(root, 'tmp');
  mkdirSync(tmp);
  writeFileSync(join(tmp, 'Review 2026_03_10.vtt'), 'WEBVTT\n\n00:01.000 --> 00:02.000\nhola\n');
  writeFileSync(join(tmp, 'daily.txt'), 'daily notes');
  assert.equal(dateFromName('Review 2026_03_10.vtt'), '2026-03-10');

  const first = addSource(root, loaded, join(tmp, 'Review 2026_03_10.vtt'), { name: 'Review' });
  assert.equal(first.written, true);
  assert.equal(first.label, '2026-03-10 Review');
  assert.ok(existsSync(join(root, DIR, 'transcripts/2026-03-10-review.vtt')));
  assert.equal(readFileSync(join(root, DIR, 'transcripts/.gitignore'), 'utf8'), '*\n!.gitignore\n');
  assert.match(readFileSync(join(root, DIR, '_sources.md'), 'utf8'), /^# Fuentes[\s\S]*\| Fecha \| Fuente \| Tipo \| Archivo \| SHA-256 \|/);

  assert.equal(addSource(root, loaded, join(tmp, 'Review 2026_03_10.vtt'), { name: 'Again' }).duplicate, '2026-03-10 Review');
  const older = addSource(root, loaded, join(tmp, 'daily.txt'), { name: 'Daily', date: '2026-03-01', type: 'daily' });
  assert.equal(older.olderThan, '2026-03-10 Review');
  assert.equal(older.written, false);
  assert.equal(addSource(root, loaded, join(tmp, 'daily.txt'), { name: 'Daily', date: '2026-03-01', type: 'daily', force: true }).written, true);
  assert.deepEqual(loadDiscovery(root, loaded).sources.map((s) => s.label), ['2026-03-01 Daily', '2026-03-10 Review']);
  assert.throws(() => addSource(root, loaded, join(tmp, 'daily.txt'), { name: 'x' }), /meeting date unknown/);
  writeFileSync(join(tmp, 'notes.docx'), 'x');
  assert.throws(() => addSource(root, loaded, join(tmp, 'notes.docx'), { name: 'x', date: '2026-03-11' }), /unsupported transcript/);
  assert.deepEqual(validateDiscovery(root, loaded).errors, []);
});

test('replaceTableRows and appendChange keep the rest of the file', () => {
  const raw = topicTemplate({ slug: 'x', title: 'X', created: '2026-01-01', locale: 'en' });
  const one = replaceTableRows(raw, 'features', [{ id: 'F1', text: 'a | b', status: 'requested', repo: 'missing', ticket: 'no ticket', blocked_by: '', evidence: 'seed · branch x' }], 'en');
  const t = parseTopic(appendChange(one, '- seed: F1 added', 'en'), 'x');
  assert.deepEqual(t.problems, []);
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].cells.text, 'a \\| b');
  assert.deepEqual(t.changes.map((c) => c.text), ['- seed: F1 added']);
  assert.equal(parseTopic(replaceTableRows(one, 'features', [], 'en'), 'x').rows.length, 0);
});

test('unmerged branches: ahead of the base, with files and tickets; merged ones are left out', () => {
  const root = repo({ version: 1, locale: 'en', tracker: { provider: 'jira', project_key: 'SHOP' } });
  gitIn(root, 'checkout', '-qb', 'change/refunds');
  writeFileSync(join(root, 'refunds.ts'), 'x');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'SHOP-12 refunds');
  gitIn(root, 'checkout', '-qb', 'merged-one', 'main');
  gitIn(root, 'checkout', '-q', 'main');
  const b = unmergedBranches(root, loadConfig(root));
  assert.equal(b.length, 1);
  assert.equal(b[0].name, 'change/refunds');
  assert.equal(b[0].change, 'refunds');
  assert.deepEqual(b[0].files, ['refunds.ts']);
  assert.deepEqual(b[0].tickets, ['SHOP-12']);
  assert.equal(b[0].ahead, 1);
});

test('seed: one baseline row per change, story, branch and ticket; idempotent; keeps a person\'s call', async () => {
  const root = repo({ version: 1, locale: 'en', tracker: { provider: 'jira', project_key: 'SHOP' }, vcs: { default_branch: 'main' } });
  const commit = (msg: string) => {
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-qm', msg);
  };
  mkdirSync(join(root, 'changes/2026-01-export'), { recursive: true });
  writeFileSync(join(root, 'changes/2026-01-export/intent.md'), '---\nstatus: accepted\nticket: SHOP-3\n---\n# Intent: Export bookings\n');
  for (const a of ['spec', 'plan']) writeFileSync(join(root, `changes/2026-01-export/${a}.md`), `---\nstatus: approved\n---\n# ${a}\n`);
  mkdirSync(join(root, 'changes/_roadmaps/pay'), { recursive: true });
  writeFileSync(join(root, 'changes/_roadmaps/pay/roadmap.md'), '---\nroadmap: pay\nstatus: approved\n---\n# Roadmap: Pay\n\n## E1 · Pay\n\n### E1.S1 · Pay by card\n- key: SHOP-9\n\nAcceptance criteria:\n- [ ] paid\n');
  commit('export merged');
  gitIn(root, 'checkout', '-qb', 'spike/coupons');
  writeFileSync(join(root, 'coupons.ts'), 'x');
  commit('try coupons');
  gitIn(root, 'checkout', '-q', 'main');

  const issues = [
    { key: 'SHOP-3', summary: 'Export', status: 'Done', category: 'done' },
    { key: 'SHOP-9', summary: 'Pay by card', status: 'To Do', category: 'todo' },
    { key: 'SHOP-20', summary: 'Gift cards', status: 'Done', category: 'done' },
    { key: 'SHOP-21', summary: 'Old loyalty', status: "Won't do", category: 'cancelled' },
  ];
  let searched = 0;
  const fake = { search: async () => (searched++, issues) } as unknown as Tracker;
  const loaded = loadConfig(root);
  const r = await seedDiscovery(root, loaded, { tracker: () => fake, today: '2026-04-01' });
  assert.equal(searched, 1);
  assert.deepEqual(r.counts, { tracker: 4, changes: 1, stories: 1, branches: 1 });
  assert.deepEqual(r.added, ['F1', 'F2', 'F3', 'F4', 'F5']);
  const t = parseTopic(readFileSync(join(root, r.path), 'utf8'), '_baseline');
  const row = (id: string) => t.rows.find((x) => x.id === id)!.cells;
  assert.deepEqual([row('F1').text, row('F1').status, row('F1').repo, row('F1').ticket], ['Export bookings', 'done', 'exists', 'SHOP-3']);
  assert.match(row('F1').evidence, /^seed · change export \(merged; jira SHOP-3: Done\)$/);
  assert.match(row('F2').evidence, /^seed · roadmap pay#E1\.S1 \(story; jira SHOP-9: To Do\)$/);
  assert.deepEqual([row('F3').text, row('F3').status, row('F3').ticket], ['try coupons', 'in progress', 'no ticket']);
  assert.deepEqual([row('F4').status, row('F4').repo], ['done', 'not verified']);
  assert.equal(row('F5').status, 'dropped');
  assert.deepEqual(t.changes.map((c) => c.text), ['- seed: 2026-04-01 · 5 added, 0 updated']);

  writeStatus(root, loaded);
  assert.deepEqual(validateDiscovery(root, loaded).errors, []);
  assert.match(readFileSync(join(root, DIR, 'STATUS.md'), 'utf8'), /## Baseline\n\n5 features from `sdlc discovery seed` \(2 done, 1 dropped, 1 in progress, 1 requested\)/);

  const again = await seedDiscovery(root, loaded, { tracker: () => fake, today: '2026-04-02' });
  assert.deepEqual([again.added, again.updated, again.unchanged], [[], [], 5], 'nothing changed: nothing written');

  const p = join(root, r.path);
  writeFileSync(p, readFileSync(p, 'utf8').replace('| F4 | Gift cards | done |', '| F4 | Gift cards | reimplement |').replace('seed · jira SHOP-20 (Done)', 'seed · jira SHOP-20 (Done) · reason: the client wants it on mobile'));
  issues[1] = { ...issues[1], status: 'In Progress', category: 'in_progress' };
  const third = await seedDiscovery(root, loaded, { tracker: () => fake, today: '2026-04-03' });
  assert.deepEqual(third.updated, ['F2']);
  const t3 = parseTopic(readFileSync(p, 'utf8'), '_baseline');
  assert.equal(t3.rows.find((x) => x.id === 'F4')!.cells.status, 'reimplement', 'a person\'s call is kept');
  assert.equal(t3.rows.find((x) => x.id === 'F2')!.cells.evidence, 'seed · roadmap pay#E1.S1 (story; jira SHOP-9: In Progress)');

  const noTracker = repo({ version: 1, locale: 'es' });
  const solo = await seedDiscovery(noTracker, loadConfig(noTracker), { dryRun: true });
  assert.match(solo.warnings.join('\n'), /no tracker configured/);
  assert.equal(existsSync(join(noTracker, solo.path)), false, 'dry run writes nothing');
});
