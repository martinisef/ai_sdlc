import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { explainerPath, explainersFor, listExplainers } from '@ai-native-sdlc/core';
import { commitAll, project, sdlc } from './helpers.ts';

const head = (root: string) => execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

function explain(root: string, module: string, sha: string) {
  mkdirSync(join(root, 'docs/explainers'), { recursive: true });
  writeFileSync(join(root, explainerPath(module)), `---\nmodule: ${module}\nsource_sha: ${sha}\nupdated: 2026-11-03\n---\n# ${module}\n\n## Invariants\n\n## Risks\n`);
}

test('explainerPath flattens the module path', () => {
  assert.equal(explainerPath('src/billing/'), 'docs/explainers/src-billing.md');
  assert.equal(explainerPath('./lib'), 'docs/explainers/lib.md');
});

test('explainers: current until the module changes, matched by the paths a plan touches', async () => {
  const root = project({});
  mkdirSync(join(root, 'src/billing'), { recursive: true });
  mkdirSync(join(root, 'src/auth'), { recursive: true });
  writeFileSync(join(root, 'src/billing/invoice.ts'), 'export const a = 1;\n');
  writeFileSync(join(root, 'src/auth/session.ts'), 'export const s = 1;\n');
  commitAll(root, 'code');
  const sha = head(root);
  explain(root, 'src/billing', sha);
  explain(root, 'src/auth', sha);
  commitAll(root, 'docs(explain): billing, auth');

  assert.deepEqual(listExplainers(root).map((e) => [e.module, e.stale]), [['src/auth', false], ['src/billing', false]]);
  assert.deepEqual(explainersFor(root, ['src/billing/invoice.ts', 'README.md']).map((e) => e.module), ['src/billing']);
  assert.deepEqual(explainersFor(root, ['src/billingx/a.ts']), []);

  writeFileSync(join(root, 'src/billing/invoice.ts'), 'export const a = 2;\n');
  commitAll(root, 'feat: change billing');
  assert.deepEqual(listExplainers(root).map((e) => [e.module, e.stale]), [['src/auth', false], ['src/billing', true]]);

  const r = await sdlc(root, ['explainers', 'src/billing/invoice.ts']);
  assert.equal(r.code, 0);
  assert.match(r.out, /docs\/explainers\/src-billing\.md {2}src\/billing {2}\(stale/);
  const none = await sdlc(root, ['explainers', 'docs/x.md']);
  assert.match(none.out, /No explainer covers these paths/);
  const json = JSON.parse((await sdlc(root, ['explainers', '--json'])).out);
  assert.equal(json.length, 2);
});

test('explainers: no source_sha means stale', () => {
  const root = project({});
  explain(root, 'lib', '');
  commitAll(root, 'docs');
  assert.equal(listExplainers(root)[0].stale, true);
});
