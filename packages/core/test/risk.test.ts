import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { changeRisk, classifyRisk, diffFiles, escalationFrom, getChange, loadConfig, maxTier, parseEscalation, parseTier, plannedFiles, riskMarker, type FileChange, type LoadedConfig } from '@ai-native-sdlc/core';
import { gitIn, repo, writeArtifact } from './helpers.ts';

const cfg = (risk: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({ config: { version: 1, risk, ...extra }, path: '.sdlc/config.json', legacy: false, issues: [] }) as LoadedConfig;
const f = (path: string, added = 1, deleted = 0, status: FileChange['status'] = 'M'): FileChange => ({ path, status, added, deleted });

test('classifyRisk: small code change is low; docs and tests do not add weight', () => {
  const r = classifyRisk(cfg({}, { test_globs: ['tests/**'] }), [f('src/a.ts', 20, 10), f('README.md', 400), f('tests/a.test.ts', 300)]);
  assert.equal(r.tier, 'low');
  assert.deepEqual(r.reasons, []);
  assert.equal(r.weight, 30);
});

test('classifyRisk: high-risk paths, always-human paths, dependencies, protected paths and deletions', () => {
  assert.equal(classifyRisk(cfg({ high_risk_paths: ['src/auth/**'] }), [f('src/auth/session.ts')]).tier, 'high');
  const ci = classifyRisk(cfg(), [f('.github/workflows/ci.yml')]);
  assert.equal(ci.tier, 'medium');
  assert.match(ci.reasons[0].reason, /always needs a person/);
  assert.equal(classifyRisk(cfg({ always_human_paths: [] }), [f('.github/workflows/ci.yml')]).tier, 'low', 'the default list can be replaced');
  assert.match(classifyRisk(cfg(), [f('package.json')]).reasons[0].reason, /changes dependencies/);
  assert.equal(classifyRisk(cfg({}, { append_only_paths: ['db/migrate/**'] }), [f('db/migrate/001.sql')]).tier, 'medium');
  assert.match(classifyRisk(cfg(), [f('src/old.ts', 0, 10, 'D')]).reasons[0].reason, /is deleted/);
});

test('classifyRisk: size thresholds; lines in new files count half', () => {
  assert.equal(classifyRisk(cfg(), [f('src/a.ts', 60)]).tier, 'medium');
  assert.equal(classifyRisk(cfg(), [f('src/new.ts', 100, 0, 'A')]).tier, 'low', '100 new lines weigh 50');
  assert.equal(classifyRisk(cfg(), [f('src/a.ts', 900)]).tier, 'high');
  assert.equal(classifyRisk(cfg({ size: { low_max_lines: 1000, high_min_lines: 2000 } }), [f('src/a.ts', 900)]).tier, 'low');
  const r = classifyRisk(cfg({ high_risk_paths: ['src/auth/**'] }), [f('src/a.ts', 60), f('src/auth/x.ts')]);
  assert.deepEqual(r.reasons.map((x) => x.tier), ['high', 'medium'], 'highest reason first');
});

test('parseTier, maxTier and the escalation markers', () => {
  assert.equal(parseTier('high'), 'high');
  assert.equal(parseTier('routine'), 'low');
  assert.equal(parseTier('Medio — toca facturación'), 'medium');
  assert.equal(parseTier(''), undefined);
  assert.equal(maxTier('low', undefined, 'medium'), 'medium');
  assert.deepEqual(parseEscalation('Looks fine.\nESCALATE: none'), {});
  assert.deepEqual(parseEscalation('**ESCALATE:** high — changes session expiry'), { tier: 'high', reason: 'changes session expiry' });
  const m = riskMarker('medium', 'touches "billing" -->');
  assert.doesNotMatch(m.slice(0, -4), /-->/);
  assert.deepEqual(escalationFrom(['hi', riskMarker('medium', 'a'), riskMarker('high', 'b'), riskMarker('medium', 'c')]), { tier: 'high', reason: 'b' });
});

test('plannedFiles: backticked paths from the spec and plan', () => {
  const change = { artifacts: { plan: { body: 'Files: `src/auth/session.ts`, `infra/`, `README.md` and the `sdlc approve` command, see `https://x.y/z`.', path: '', data: {}, raw: '' } } };
  assert.deepEqual(plannedFiles(change), ['src/auth/session.ts', 'infra/**', 'README.md']);
});

test('changeRisk: the diff against the base, planned paths, declared risk and escalation; nothing lowers it', () => {
  const root = repo({ version: 1, risk: { high_risk_paths: ['infra/**'] } });
  gitIn(root, 'checkout', '-qb', 'change/x');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/a.ts'), Array.from({ length: 70 }, (_, i) => `line ${i}`).join('\n') + '\n');
  writeArtifact(root, '2026-11-x', 'spec', 'approved', 'risk: low\n');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'code');
  assert.deepEqual(diffFiles(root, 'main').find((x) => x.path === 'src/a.ts'), { path: 'src/a.ts', status: 'A', added: 70, deleted: 0 });
  assert.deepEqual(diffFiles(root, 'nope'), []);
  const loaded = loadConfig(root);
  const change = getChange(root, 'x')!;
  assert.equal(changeRisk(root, loaded, change, { base: 'main' }).tier, 'low', '70 new lines weigh 35; declared low');
  assert.equal(changeRisk(root, loaded, change, { base: 'main', escalated: 'medium', escalatedReason: 'second classifier' }).reasons[0].reason, 'second classifier');

  writeArtifact(root, '2026-11-x', 'plan', 'draft', 'risk: medium\n');
  writeFileSync(join(root, 'changes/2026-11-x/plan.md'), '---\nstatus: draft\nrisk: medium\n---\n# Plan\nTouches `infra/main.tf`.\n');
  const planned = changeRisk(root, loaded, getChange(root, 'x')!, {});
  assert.equal(planned.tier, 'high', 'a planned path under risk.high_risk_paths');
  assert.equal(planned.computed, 'high');
  assert.equal(changeRisk(root, loaded, getChange(root, 'x')!, { escalated: 'low' }).tier, 'high');
});
