import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitIn, repo } from './helpers.ts';
import { acceptFindings, decideGate, listChanges, loadConfig, openFindings, parseFindings } from '@ai-native-sdlc/core';

const spec = (rows: string) => `---
status: draft
author: Bob
---
# Spec: claim notes

## Requirements
- R1: saves the note.

## Review findings
<!-- spec-reviewer, on every review.
| S9 | Blocking | an example in a comment | open | |
-->
| ID | Severity | Finding | Status | Note |
|---|---|---|---|---|
${rows}

## Out of scope
| S7 | Blocking | not in the findings section | open | |
`;

test('findings: parses the table only, en and es vocabulary, escaped pipes', () => {
  const r = parseFindings(
    spec('| S1 | Blocking | no limit on `text` | resolved | R2 now caps it |\n| S2 | **Important** | a \\| b in the error | open | |\n| S3 | Menor | wording | abierto | |'),
    'spec',
  );
  assert.deepEqual(r.problems, []);
  assert.deepEqual(
    r.findings.map((f) => [f.id, f.severity, f.status]),
    [
      ['S1', 'blocking', 'resolved'],
      ['S2', 'important', 'open'],
      ['S3', 'minor', 'open'],
    ],
  );
  assert.equal(r.findings[1].finding, 'a \\| b in the error');
  const open = openFindings(r);
  assert.deepEqual([open.blocking.length, open.acceptable.map((f) => f.id)], [0, ['S2', 'S3']]);

  const es = parseFindings('# Spec\n\n## Hallazgos de la revisión\n| ID | Severidad | Hallazgo | Estado | Nota |\n|---|---|---|---|---|\n| S1 | Bloqueante | x | abierto | |\n', 'spec');
  assert.equal(openFindings(es).blocking[0].id, 'S1');
});

test('findings: duplicate IDs, a wrong prefix and unknown values are problems', () => {
  const r = parseFindings(spec('| S1 | Blocking | a | open | |\n| S1 | Minor | b | open | |\n| V1 | Severe | c | wip | |'), 'spec');
  assert.equal(r.problems.length, 4);
  assert.match(r.problems.join('\n'), /S1 appears twice[\s\S]*V1 should be numbered S1[\s\S]*severity "Severe"[\s\S]*status "wip"/);
});

test('findings: acceptFindings marks rows accepted in the table language and keeps notes', () => {
  const text = spec('| S1 | Blocking | a | resolved | done |\n| S2 | Important | b | open | |\n| S3 | Menor | c | abierto | ya hablado |');
  const out = acceptFindings(text, ['S2', 'S3'], 'accepted by Ana at approval');
  assert.match(out, /^\| S2 \| Important \| b \| accepted \| accepted by Ana at approval \|$/m);
  assert.match(out, /^\| S3 \| Menor \| c \| aceptado \| ya hablado \|$/m);
  assert.match(out, /^\| S1 \| Blocking \| a \| resolved \| done \|$/m);
});

test('findings: the spec gate refuses an open Blocking finding and records the accepted risk', () => {
  const root = repo();
  gitIn(root, 'checkout', '-qb', 'change/notes');
  const dir = join(root, 'changes/2026-11-notes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'spec.md'), spec('| S1 | Blocking | no limit on `text` | open | |\n| S2 | Important | vague error | open | |\n| S3 | Minor | wording | resolved | |'));
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'spec');
  const loaded = loadConfig(root);
  assert.throws(() => decideGate(root, loaded, 'notes', 'spec', 'approved'), /S1 is a Blocking finding still open in changes\/2026-11-notes\/spec\.md/);

  writeFileSync(join(dir, 'spec.md'), readFileSync(join(dir, 'spec.md'), 'utf8').replace('on `text` | open | |', 'on `text` | resolved | R2 caps it |'));
  gitIn(root, 'commit', '-qam', 'resolve S1');
  decideGate(root, loaded, 'notes', 'spec', 'approved');
  const after = readFileSync(join(dir, 'spec.md'), 'utf8');
  assert.match(after, /^status: approved/m);
  assert.match(after, /^\| S2 \| Important \| vague error \| accepted \| accepted by Ana Product at approval \|$/m);
  assert.match(gitIn(root, 'log', '-1', '--format=%B'), /Gate: spec approved by Ana Product <ana@example\.com>\nAccepted-risk: S2$/);
  assert.equal(listChanges(root).find((c) => c.slug === 'notes')?.artifacts.spec?.status, 'approved');
});
