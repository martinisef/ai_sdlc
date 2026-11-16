import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitAll, project, sdlc } from './helpers.ts';

test('sdlc trace: lists coverage, exits 1 on a dropped requirement, --json', async () => {
  const root = project({ locale: 'en' }, 'change/notes');
  const dir = join(root, 'changes/2026-11-notes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'spec.md'), '---\nstatus: approved\n---\n# Spec\n\n- R1: saves the note.\n- R2: rejects blank text.\n');
  writeFileSync(join(dir, 'plan.md'), '---\nstatus: draft\n---\n# Plan\n\n## Verification\n- R1-2: `make test`\n');
  commitAll(root, 'artifacts');

  const ok = await sdlc(root, ['trace']);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /2026-11-notes: 2 requirements, all covered by the plan/);
  assert.match(ok.out, /R2\s+R1-2: `make test`/);

  writeFileSync(join(dir, 'plan.md'), '---\nstatus: draft\n---\n# Plan\n\n## Verification\n- R1: `make test`\n- R3: lint\n');
  const bad = await sdlc(root, ['trace', 'notes']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /✗ R2 from spec\.md is not in the plan's Verification/);
  assert.match(bad.out, /✗ .*names R3, which spec\.md does not define/);

  const json = JSON.parse((await sdlc(root, ['trace', 'notes', '--json'])).out);
  assert.deepEqual({ requirements: json.requirements, missing: json.missing, orphans: json.orphans }, { requirements: ['R1', 'R2'], missing: ['R2'], orphans: ['R3'] });

  assert.equal((await sdlc(root, ['trace', 'nope'])).code, 1);
});
