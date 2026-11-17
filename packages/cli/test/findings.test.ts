import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitAll, project, sdlc } from './helpers.ts';

const table = (heading: string, rows: string) => `\n## ${heading}\n| ID | Severity | Finding | Status | Note |\n|---|---|---|---|---|\n${rows}\n`;

test('sdlc findings: lists spec and plan findings, exits 1 on an open Blocking one, --json', async () => {
  const root = project({ locale: 'en' }, 'change/notes');
  const dir = join(root, 'changes/2026-11-notes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'spec.md'), `---\nstatus: approved\n---\n# Spec\n${table('Review findings', '| S1 | Important | vague error | accepted | accepted by Ana at approval |')}`);
  writeFileSync(join(dir, 'plan.md'), `---\nstatus: approved\n---\n# Plan\n${table('Verification findings', '| V1 | Minor | slow list | open | |')}`);
  commitAll(root, 'artifacts');

  const ok = await sdlc(root, ['findings']);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /changes\/2026-11-notes\/spec\.md\n\s+S1\s+important accepted vague error \(accepted by Ana at approval\)/);
  assert.match(ok.out, /V1\s+minor\s+open\s+slow list/);

  writeFileSync(join(dir, 'plan.md'), `---\nstatus: approved\n---\n# Plan\n${table('Verification findings', '| V1 | Minor | slow list | open | |\n| V2 | Blocking | 500 on empty text | open | |')}`);
  const bad = await sdlc(root, ['findings', 'notes']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /✗ open Blocking: V2/);
  const json = JSON.parse((await sdlc(root, ['findings', 'notes', '--json'])).out);
  assert.deepEqual(json.findings.map((f: { id: string }) => f.id), ['S1', 'V1', 'V2']);
});
