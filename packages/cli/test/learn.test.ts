// `sdlc learn`: keep a confirmed correction, list it, and `sdlc sync` leaves the AGENTS.md copy alone.
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { project, sdlc } from './helpers.ts';

test('learn: kept in CLAUDE.md and AGENTS.md, a duplicate does nothing, list and doctor read it, sync keeps it', async () => {
  const root = project({ locale: 'en', agents: ['claude', 'agents-md'] });
  assert.equal((await sdlc(root, ['sync'])).code, 0);

  const add = await sdlc(root, ['learn', 'Call a stock item a SKU, never a product', '--stage', 'spec', '--change', 'stock']);
  assert.equal(add.code, 0, add.err);
  assert.equal(add.out, 'kept in CLAUDE.md and AGENTS.md: Call a stock item a SKU, never a product\nCommit it with the change, so the next session reads it.');
  const dup = await sdlc(root, ['learn', 'call a stock item a SKU — never a product']);
  assert.equal(dup.out, 'already kept in CLAUDE.md and AGENTS.md: nothing to do');

  const list = await sdlc(root, ['learn', 'list', '--json']);
  const items = JSON.parse(list.out) as { file: string; text: string; source?: string }[];
  assert.deepEqual(items.map((i) => [i.file, i.text, i.source]), [
    ['CLAUDE.md', 'Call a stock item a SKU, never a product', '/sdlc-spec stock'],
    ['AGENTS.md', 'Call a stock item a SKU, never a product', '/sdlc-spec stock'],
  ]);

  assert.equal((await sdlc(root, ['sync'])).code, 0);
  assert.match(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /- Call a stock item a SKU, never a product \(learned \d{4}-\d{2}-\d{2}, \/sdlc-spec stock\)/);

  appendFileSync(join(root, 'CLAUDE.md'), Array.from({ length: 31 }, (_, i) => `- Rule number ${i} about the codebase\n`).join(''));
  const doctor = JSON.parse((await sdlc(root, ['doctor', '--json'])).out) as { checks: { id: string; level: string; message: string }[] };
  assert.match(doctor.checks.find((c) => c.id === 'learnings')?.message ?? '', /CLAUDE\.md has 32 learnings/);

  const bad = await sdlc(root, ['learn', '']);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /usage: sdlc learn/);
});
