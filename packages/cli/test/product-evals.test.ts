// The product's own eval suite (evals/*.json over examples/) must stay well-formed: the agent runs are
// expensive, so a broken case should fail here, not after twenty minutes of CI.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadEvals } from '../src/ci/evals.ts';
import { REPO } from './helpers.ts';

const CHECKS = new Set(['command', 'diff_excludes', 'diff_includes', 'output_contains', 'file_matches']);

test('product evals: 20+ well-formed cases over examples/', () => {
  const evals = loadEvals(REPO);
  assert.ok(evals.length >= 20, `only ${evals.length} evals`);
  const files = readdirSync(join(REPO, 'evals')).filter((f) => f.endsWith('.json'));
  for (const f of files) assert.equal(JSON.parse(readFileSync(join(REPO, 'evals', f), 'utf8')).name, f.slice(0, -5), `${f}: name matches the file`);

  const examples = new Set<string>();
  for (const e of evals) {
    assert.ok(e.cwd && existsSync(join(REPO, e.cwd, '.sdlc/config.json')), `${e.name}: cwd is an initialized example`);
    examples.add(e.cwd!);
    assert.ok(e.prompt.trim().length > 10, `${e.name}: prompt`);
    assert.ok(e.checks.length > 0, `${e.name}: at least one check`);
    for (const c of e.checks) {
      assert.ok(CHECKS.has(c.type), `${e.name}: unknown check ${c.type}`);
      if (c.type === 'file_matches') assert.doesNotThrow(() => new RegExp(c.pattern, 'm'), `${e.name}: regex ${c.pattern}`);
    }
    for (const m of (e.setup ?? '').matchAll(/fixtures\/stage\.sh \S+ (\S+)((?: [a-z]+(?::[a-z]+)?)+)/g)) {
      for (const artifact of m[2]!.trim().split(' ')) {
        assert.ok(existsSync(join(REPO, 'evals/fixtures', m[1]!, `${artifact.split(':')[0]}.md`)), `${e.name}: fixture ${m[1]}/${artifact}`);
      }
    }
  }
  assert.deepEqual([...examples].sort(), ['examples/python-api', 'examples/typescript-lib']);
  for (const tag of ['intent', 'spec', 'plan', 'build', 'fix', 'incident', 'status', 'protected-paths', 'secrets', 'test-lock', 'production-gate', 'gates']) {
    assert.ok(evals.some((e) => e.tags?.includes(tag)), `no eval covers ${tag}`);
  }
  for (const f of readdirSync(join(REPO, 'evals/fixtures')).filter((f) => f.endsWith('.sh'))) {
    assert.ok(statSync(join(REPO, 'evals/fixtures', f)).mode & 0o100, `${f} is executable`);
  }
});
