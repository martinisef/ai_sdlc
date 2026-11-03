// `sdlc ci nightly-review` against the claude and gh stubs: rotation, verified findings, one intent per Important one.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '@ai-native-sdlc/core';
import { moduleFor, nightlyModules } from '../src/ci/nightly.ts';
import { commitAll, project, sdlc } from './helpers.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'sdlc-stub-'));

function codeRepo(config: object = {}) {
  const root = project({ vcs: { provider: 'github', default_branch: 'main' }, ...config });
  for (const f of ['src/a.py', 'src/billing/b.py', 'src/billing/c.py', 'packages/api/x.ts', 'tests/test_a.py', 'docs/a.md', 'tools.py']) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), 'x = 1\n');
  }
  commitAll(root, 'code');
  return root;
}

test('nightly modules: code directories (src/, and each child of src/ and packages/), never tests or docs; ci.nightly.modules wins', () => {
  const root = codeRepo();
  assert.deepEqual(nightlyModules(root, loadConfig(root)), ['packages/api', 'src', 'src/billing']);
  const day = (n: number) => new Date(n * 86_400_000 + 3_600_000);
  assert.deepEqual([0, 1, 2].map((n) => moduleFor(['a', 'b'], day(n))), ['a', 'b', 'a'], 'one module per day, in turn');
  assert.equal(moduleFor([], day(0)), undefined);
  const set = codeRepo({ ci: { nightly: { modules: ['src'] } } });
  assert.deepEqual(nightlyModules(set, loadConfig(set)), ['src']);
});

function withRemote(root: string) {
  const remote = join(tmp(), 'r.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
  execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: root });
  return remote;
}

test('nightly-review: Important findings become intents on their own branch with a draft PR, never twice', async () => {
  const root = codeRepo();
  const remote = withRemote(root);
  const log = join(tmp(), 'calls.log');
  const r = await sdlc(root, ['ci', 'nightly-review', '--module', 'src', '--pr'], { STUB_LOG: log });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /## Nightly review: src\n\nImportant: 1 · Nit: 1/);
  assert.match(r.out, /\| n1 \| Important \| `src\/a.py:3` \| off by one \| off-by-one \|/);
  const calls = readFileSync(log, 'utf8');
  assert.match(calls, /review finder for existing code: there is no diff, read the module src/);
  assert.equal((calls.match(/claude -p You are a review finder/g) ?? []).length, 3, 'bugs, security, tests');
  assert.match(calls, /review verifier for a review of existing code in src/);
  assert.match(calls, /gh pr create --title Intent: off-by-one in src\/a.py .* --base main --head change\/review-off-by-one-\d{8}-1 --draft/s);

  const branch = execFileSync('git', ['branch', '--list', 'change/review-*', '--format=%(refname:short)'], { cwd: remote, encoding: 'utf8' }).trim();
  assert.match(branch, /^change\/review-off-by-one-\d{8}-1$/);
  const files = execFileSync('git', ['show', '--name-only', '--format=%B', branch], { cwd: remote, encoding: 'utf8' });
  assert.match(files, /Nightly-Finding: src\/a.py#off-by-one/);
  const dir = /changes\/\d{4}-\d{2}-review-off-by-one-\d{8}-1/.exec(files)![0];
  const intent = execFileSync('git', ['show', `${branch}:${dir}/intent.md`], { cwd: remote, encoding: 'utf8' });
  assert.match(intent, /^origin: review/m);
  assert.match(intent, /^status: draft/m);
  assert.match(intent, /^# Intent: off-by-one in src\/a.py/m);
  assert.match(intent, /\*\*Important\*\* · off-by-one · `src\/a.py:3`/);
  assert.equal(JSON.parse(readFileSync(join(root, 'nightly-review.json'), 'utf8')).intents.length, 1);

  const again = await sdlc(root, ['ci', 'nightly-review', '--module', 'src'], { STUB_LOG: log });
  assert.match(again.out, /Skipped n1 src\/a.py#off-by-one: an intent already exists/);
});

test('nightly-review: ci.nightly.max_intents caps a night; --dry-run commits nothing', async () => {
  const root = codeRepo({ ci: { nightly: { max_intents: 1 } } });
  const findings = join(tmp(), 'f.json');
  writeFileSync(
    findings,
    JSON.stringify([
      { severity: 'important', file: 'src/a.py', line: 1, title: 'unchecked input', evidence: 'e', bug_class: 'missing validation' },
      { severity: 'important', file: 'src/billing/b.py', line: 1, title: 'double charge', evidence: 'e', bug_class: 'race condition' },
    ]),
  );
  const env = { STUB_LOG: join(tmp(), 'log'), STUB_FINDINGS: findings };
  const dry = await sdlc(root, ['ci', 'nightly-review', '--module', 'src', '--dry-run'], env);
  assert.match(dry.out, /Intent for n1: `changes\/\d{4}-\d{2}-review-missing-validation-\d{8}-1\/intent.md`/);
  assert.match(dry.out, /Skipped n2 src\/billing\/b.py#race condition: ci.nightly.max_intents \(1\) reached/);
  assert.equal(execFileSync('git', ['branch', '--list', 'change/*'], { cwd: root, encoding: 'utf8' }).trim(), '', 'dry run: no branch');
});
