import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { durationSeconds, evaluateBand, loadBands, tierFor } from '@ai-native-sdlc/core';

// mean 11, σ ≈ 1.026 (sample)
const baseline = Array.from({ length: 20 }, (_, i) => (i % 2 ? 12 : 10));
const opts = { window: 30, direction: 'both' as const, minPoints: 10 };

test('bands: Western Electric rules map to σ tiers', () => {
  assert.equal(evaluateBand([...baseline, 11], opts).status, 'ok');

  const r1 = evaluateBand([...baseline, 20], opts);
  assert.deepEqual([r1.status, r1.level, r1.rule], ['broken', 3, 'rule1']);
  assert.ok(Math.abs(r1.mean - 11) < 0.1, 'the most recent points are held out of the baseline');
  assert.ok(r1.z > 8);

  assert.deepEqual(pick(evaluateBand([...baseline, 13.4, 11, 13.4], opts)), [2, 'rule2']);
  assert.deepEqual(pick(evaluateBand([...baseline, 12.3, 12.3, 11, 12.3, 12.3], opts)), [1, 'rule3']);
  assert.deepEqual(pick(evaluateBand([...baseline, ...Array(8).fill(11.5)], opts)), [1, 'rule4']);
  assert.deepEqual(pick(evaluateBand([...baseline, 2], opts)), [3, 'rule1'], 'both directions by default');
});

test('bands: direction, insufficient data, flat baselines', () => {
  assert.equal(evaluateBand([...baseline, 2], { ...opts, direction: 'up' }).status, 'ok', 'a drop is fine when only "up" is bad');
  assert.equal(evaluateBand([...baseline, 20], { ...opts, direction: 'down' }).status, 'ok');
  assert.equal(evaluateBand([1, 2, 3], opts).status, 'insufficient');
  const flat = Array(12).fill(5);
  assert.equal(evaluateBand([...flat, 5], opts).status, 'ok');
  assert.deepEqual(pick(evaluateBand([...flat, 6], opts)), [3, 'rule1'], 'any move off a flat baseline');
});

test('bands: tier fallback, durations, ops/bands.yaml validation', () => {
  const band = { tiers: { '1sigma': { action: 'log' as const }, '3sigma': { action: 'propose' as const } } } as Parameters<typeof tierFor>[0];
  assert.equal(tierFor(band, 2)?.sigma, 1, '2σ without a 2σ tier falls back to 1σ');
  assert.equal(tierFor(band, 3)?.tier.action, 'propose');
  assert.equal(tierFor(band, 0), undefined);
  assert.equal(durationSeconds('30d'), 30 * 86400);
  assert.throws(() => durationSeconds('month'));

  const root = mkdtempSync(join(tmpdir(), 'sdlc-bands-'));
  assert.equal(loadBands(root), undefined);
  mkdirSync(join(root, 'ops'));
  writeFileSync(join(root, 'ops/bands.yaml'), '# all commented out\n');
  assert.deepEqual(loadBands(root), { window: 30, bands: [] });
  writeFileSync(join(root, 'ops/bands.yaml'), 'bands:\n  - metric: m\n    source: { command: "echo 1" }\n    tiers: { 3sigma: { action: page } }\n');
  assert.throws(() => loadBands(root), /bands\.0\.tiers\.3sigma\.action/);
  writeFileSync(join(root, 'ops/bands.yaml'), 'window: 14\nbands:\n  - metric: m\n    source: { command: "echo 1" }\n    direction: up\n    tiers: { 1sigma: { action: log } }\n');
  assert.equal(loadBands(root)?.bands[0].min_points, 10);
});

function pick(e: ReturnType<typeof evaluateBand>) {
  return [e.level, e.rule];
}
