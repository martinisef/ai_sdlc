import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitIn, repo } from './helpers.ts';
import { decideGate, listChanges, loadConfig, traceChange } from '@ai-native-sdlc/core';

const SPEC = `---
status: approved
---
# Spec: claim notes

## Requirements
- R1: POST returns 201 with the note.
- R2: blank fields return 400.
- **R3**: GET lists notes oldest first.
- R4: notes survive a restart.
- R5:
`;

function write(root: string, name: string, body: string) {
  mkdirSync(join(root, 'changes/2026-11-notes'), { recursive: true });
  writeFileSync(join(root, 'changes/2026-11-notes', `${name}.md`), body);
}

const plan = (verification: string, status = 'draft') => `---
status: ${status}
---
# Plan: claim notes

## Steps
1. Add the route (fixes R9 from the old ticket, not a requirement here).

## Verification
${verification}

## Discarded alternatives
- R7 in a queue — too slow
`;

const traced = (root: string) => traceChange(root, listChanges(root).find((c) => c.slug === 'notes')!);

test('trace: every requirement covered, ranges expand, other sections ignored', () => {
  const root = repo();
  write(root, 'spec', SPEC);
  write(root, 'plan', plan('- R1, R2: `tests/test_notes.py` (`make test`)\n- R3-4: restart test\n- Also: lint clean'));
  const r = traced(root);
  assert.deepEqual(r.requirements, ['R1', 'R2', 'R3', 'R4']);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.orphans, []);
  assert.match(r.covered.R4, /restart test/);
  assert.ok(r.warnings.some((w) => w.includes('tests/test_notes.py') && w.includes('does not exist')));

  write(root, 'plan', plan('- R1–R4: all in `tests/test_notes.py`'));
  assert.deepEqual(traced(root).errors, []);
  write(root, 'plan', plan('- R1..R4: all of them'));
  assert.deepEqual(traced(root).errors, []);
});

test('trace: missing and orphan requirements are errors; no Verification section is an error', () => {
  const root = repo();
  write(root, 'spec', SPEC);
  write(root, 'plan', plan('- R1: test\n- R3: test\n- R6: test'));
  const r = traced(root);
  assert.deepEqual(r.missing, ['R2', 'R4']);
  assert.deepEqual(r.orphans, ['R6']);
  assert.equal(r.errors.length, 3);

  write(root, 'plan', '---\nstatus: draft\n---\n# Plan\n\n## Steps\n1. R1\n');
  assert.match(traced(root).errors[0], /no ## Verification section/);
});

test('trace: spec without IDs or no spec only warns; es heading works', () => {
  const root = repo();
  write(root, 'intent', '---\nstatus: accepted\n---\n# Intent\n');
  write(root, 'plan', plan('- R1: test'));
  const none = traced(root);
  assert.deepEqual(none.errors, []);
  assert.match(none.warnings[0], /no spec\.md/);

  write(root, 'spec', '---\nstatus: approved\n---\n# Spec\n\n- The note is saved.\n');
  const noIds = traced(root);
  assert.deepEqual(noIds.errors, []);
  assert.match(noIds.warnings[0], /numbers no requirements/);

  write(root, 'spec', SPEC);
  write(root, 'plan', '---\nstatus: draft\n---\n# Plan\n\n## Prueba\n- R1–R4: `make test`\n');
  assert.deepEqual(traced(root).errors, []);
});

test('trace: the plan gate refuses a plan that drops a requirement', () => {
  const root = repo();
  gitIn(root, 'checkout', '-qb', 'change/notes');
  write(root, 'spec', SPEC.replace('status: approved', 'status: approved\napproved_by: Ana Product'));
  write(root, 'plan', plan('- R1-3: test'));
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'artifacts');
  const loaded = loadConfig(root);
  assert.throws(() => decideGate(root, loaded, 'notes', 'plan', 'approved'), /does not cover the spec[\s\S]*R4 from spec\.md/);

  write(root, 'plan', plan('- R1-4: test'));
  gitIn(root, 'commit', '-qam', 'cover R4');
  decideGate(root, loaded, 'notes', 'plan', 'approved');
  assert.equal(listChanges(root).find((c) => c.slug === 'notes')?.artifacts.plan?.status, 'approved');
});
