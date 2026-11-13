// `sdlc discovery …` end to end: register a transcript, write a topic as the agent would, validate, status, follow-up, seed.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitAll, project, sdlc } from './helpers.ts';

const TOPIC = `---
topic: checkout
title: Checkout
created: 2026-05-04
---
# Checkout

## Features
| ID | Feature | Status | Repo | Ticket | Blocked by | Evidence |
|---|---|---|---|---|---|---|
| F1 | Pay with a saved card | requested | missing | no ticket | Q1 | 2026-05-04 Weekly sync · 03:10 · Rita: "save the card" |

## Questions
| ID | Question | To | Status | Since | Answer | Evidence |
|---|---|---|---|---|---|---|
| Q1 | Which card brands? | Client: Rita | open | 2026-05-04 | | 2026-05-04 Weekly sync · Dev: "brands?" |

## Changes
- 2026-05-04 Weekly sync: F1, Q1 added
`;

test('discovery: add → topic → validate → status → follow-up, with --json', async () => {
  const root = project({ locale: 'en', vcs: { default_branch: 'main' } });
  writeFileSync(join(root, '..', 'weekly-sync-2026-05-04.txt'), 'Rita: we want to save the card\n');
  const check = await sdlc(root, ['discovery', 'add', '../weekly-sync-2026-05-04.txt', '--name', 'Weekly sync', '--check']);
  assert.equal(check.code, 0, check.err);
  assert.equal(check.out, '✓ 2026-05-04 Weekly sync is new');
  assert.equal(existsSync(join(root, 'changes/_discovery')), false, '--check writes nothing');

  const add = await sdlc(root, ['discovery', 'add', '../weekly-sync-2026-05-04.txt', '--name', 'Weekly sync']);
  assert.equal(add.code, 0, add.err);
  assert.match(add.out, /^added '2026-05-04 Weekly sync' → changes\/_discovery\/transcripts\/2026-05-04-weekly-sync\.txt/);
  const dup = await sdlc(root, ['discovery', 'add', '../weekly-sync-2026-05-04.txt', '--name', 'Again']);
  assert.equal(dup.code, 1);
  assert.match(dup.out, /already processed as '2026-05-04 Weekly sync'/);

  mkdirSync(join(root, 'changes/_discovery/topics'), { recursive: true });
  writeFileSync(join(root, 'changes/_discovery/topics/checkout.md'), TOPIC.replace('| requested |', '| wanted |'));
  const bad = await sdlc(root, ['discovery', 'validate']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /checkout\.md:\d+: F1: status 'wanted' is not one of/);
  writeFileSync(join(root, 'changes/_discovery/topics/checkout.md'), TOPIC);

  const status = await sdlc(root, ['discovery', 'status']);
  assert.equal(status.out, 'wrote changes/_discovery/STATUS.md: 1 to do, 1 open question, 0 open action items');
  const ok = JSON.parse((await sdlc(root, ['discovery', 'validate', '--json'])).out);
  assert.deepEqual([ok.errors, ok.warnings, ok.rows], [[], [], 2]);
  const s = JSON.parse((await sdlc(root, ['discovery', 'status', '--json'])).out);
  assert.deepEqual(Object.keys(s.byRecipient), ['Client: Rita']);
  assert.equal(s.todo[0].blockedBy[0], 'Q1');

  assert.deepEqual((await sdlc(root, ['discovery', 'search', 'saved', 'card'])).out.split('\n'), ['checkout#F1\trequested\tPay with a saved card', 'checkout#Q1\topen\tWhich card brands?']);
  const f = await sdlc(root, ['discovery', 'followup', '--write']);
  assert.equal(f.out, 'wrote changes/_discovery/followups/2026-05-04-weekly-sync.md');
  assert.match(readFileSync(join(root, 'changes/_discovery/followups/2026-05-04-weekly-sync.md'), 'utf8'), /1\. Which card brands\? \(checkout#Q1\)/);

  commitAll(root, 'discovery');
  const seed = await sdlc(root, ['discovery', 'seed']);
  assert.equal(seed.code, 0, seed.err);
  assert.match(seed.out, /no tracker configured/);
  assert.match(seed.out, /wrote changes\/_discovery\/topics\/_baseline\.md: 0 added/);
  assert.equal((await sdlc(root, ['discovery', 'branches'])).out, 'no branches with work missing from main');
  assert.equal((await sdlc(root, ['status'])).out.includes('_discovery'), false, 'not listed as a change');
});

test('discovery --help and unknown subcommands', async () => {
  const root = project({ locale: 'en' });
  assert.match((await sdlc(root, ['discovery', '--help'])).out, /^sdlc discovery add <file>/);
  const r = await sdlc(root, ['discovery', 'nope']);
  assert.equal(r.code, 1);
  assert.match(r.err, /sdlc discovery validate/);
});

test('roadmap new --from-discovery: ready features become stories, blocked ones open questions', async () => {
  const root = project({ locale: 'en' });
  mkdirSync(join(root, 'changes/_discovery/topics'), { recursive: true });
  writeFileSync(join(root, 'changes/_discovery/_sources.md'), '| Date | Source | Type | File | SHA-256 |\n|---|---|---|---|---|\n| 2026-05-04 | Weekly sync | client | transcripts/a.txt | abc |\n');
  const topic = TOPIC.replace(
    '| F1 |',
    '| F2 | Show the receipt after paying | requested | missing | no ticket | | 2026-05-04 Weekly sync · Rita: "a receipt" |\n| F3 | Refunds | requested | missing | SHOP-4 | | 2026-05-04 Weekly sync · Rita: "refunds" |\n| F1 |',
  );
  writeFileSync(join(root, 'changes/_discovery/topics/checkout.md'), topic);
  const none = await sdlc(root, ['roadmap', 'new', 'pay', '--from-discovery', 'nope']);
  assert.equal(none.code, 1);
  assert.match(none.err, /no discovery topic nope/);
  const r = await sdlc(root, ['roadmap', 'new', 'pay', '--from-discovery', 'checkout', '--title', 'Payments']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^created changes\/_roadmaps\/pay\/roadmap\.md: 1 epic, 1 story from changes\/_discovery; 1 open question for the blocked checkout#F1/);
  const raw = readFileSync(join(root, 'changes/_roadmaps/pay/roadmap.md'), 'utf8');
  assert.match(raw, /^source: changes\/_discovery\/STATUS\.md$/m);
  assert.match(raw, /^## E1 · Checkout\n\n### E1\.S1 · Show the receipt after paying\n- risk: medium\n- depends: -\n- source: checkout#F2\n\n> 2026-05-04 Weekly sync · Rita: "a receipt"/m);
  assert.doesNotMatch(raw, /Refunds/, 'a feature with a ticket is not drafted again');
  assert.match(raw, /^- Q1: checkout#F1 "Pay with a saved card" waits on checkout#Q1 "Which card brands\?" \(Client: Rita\)\n {2}A:$/m);
  const check = JSON.parse((await sdlc(root, ['roadmap', 'check', 'pay', '--json'])).out);
  assert.deepEqual(check.errors.filter((e: string) => !/has no answer/.test(e)), []);
});
