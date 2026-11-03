import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitAll, project, sdlc } from './helpers.ts';

test('sdlc quick → quick-ready, --check enforces limits, promote returns it to the full loop', async () => {
  const root = project({ locale: 'en', risk: { high_risk_paths: ['src/store.py'] } });
  const r = await sdlc(root, ['quick', 'Fix the health typo']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /quick lane: no spec, no plan/);
  const dir = readdirSync(join(root, 'changes')).find((d) => d.endsWith('fix-the-health-typo'))!;
  assert.match(readFileSync(join(root, 'changes', dir, 'intent.md'), 'utf8'), /^lane: quick$/m);
  commitAll(root, 'quick intent');

  const next = JSON.parse((await sdlc(root, ['next', '--json'])).out);
  assert.equal(next.stage, 'quick-ready');
  assert.equal(next.skill, '/sdlc-quick');

  writeFileSync(join(root, 'app.py'), 'x');
  assert.equal((await sdlc(root, ['quick', '--check'])).code, 0);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/store.py'), 'x');
  const bad = await sdlc(root, ['quick', '--check']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /promote it \(sdlc promote fix-the-health-typo\): src\/store\.py is a high-risk path/);

  const p = await sdlc(root, ['promote']);
  assert.equal(p.code, 0, p.err);
  const intent = readFileSync(join(root, 'changes', dir, 'intent.md'), 'utf8');
  assert.match(intent, /^lane: full$/m);
  assert.match(intent, /^status: draft$/m);
  assert.equal(JSON.parse((await sdlc(root, ['next', '--json'])).out).stage, 'intent-draft');
});

test('sdlc quick refuses when the quick lane is disabled', async () => {
  const root = project({ locale: 'en', quick_lane: { enabled: false } });
  const r = await sdlc(root, ['quick', 'anything']);
  assert.equal(r.code, 1);
  assert.match(r.err, /quick lane is disabled/);
});

test('sdlc quick drops accents from the slug instead of breaking the word', async () => {
  const root = project({ locale: 'es' });
  const r = await sdlc(root, ['quick', 'La lista muestra cuántas tareas hay']);
  assert.equal(r.code, 0, r.err);
  assert.ok(readdirSync(join(root, 'changes')).some((d) => d.endsWith('-la-lista-muestra-cuantas-tareas-hay')));
});
