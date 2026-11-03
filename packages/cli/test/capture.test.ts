// `sdlc ci capture-eval`: a reverted commit or the cause of an incident becomes a reviewer eval that reproduces it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyChecks, loadEvals } from '../src/ci/evals.ts';
import { commitAll, project, REPO, sdlc } from './helpers.ts';

const git = (root: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: root, encoding: 'utf8' }).trim();

function reverted() {
  const root = project({});
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/limits.py'), 'MAX = 100\n\ndef ok(n):\n    return n <= MAX\n');
  commitAll(root, 'feat: limits');
  writeFileSync(join(root, 'src/limits.py'), 'MAX = 100\n\ndef ok(n):\n    return n < MAX\n');
  commitAll(root, 'refactor: simplify ok');
  const culprit = git(root, 'rev-parse', 'HEAD');
  git(root, 'revert', '--no-edit', 'HEAD');
  mkdirSync(join(root, 'evals/fixtures'), { recursive: true });
  execFileSync('cp', [join(REPO, 'evals/fixtures/commit.sh'), join(root, 'evals/fixtures/commit.sh')]);
  commitAll(root, 'evals');
  return { root, culprit };
}

test('capture-eval --reverts: one eval per reverted commit, its patch, never twice', async () => {
  const { root, culprit } = reverted();
  const r = await sdlc(root, ['ci', 'capture-eval', '--reverts', '--since', '30d']);
  assert.equal(r.code, 0, r.err);
  const name = `review-revert-${culprit.slice(0, 8)}`;
  assert.match(r.out, new RegExp(`wrote evals/${name}.json\\n1 new reviewer eval\\(s\\) from 1 revert\\(s\\)`));
  const e = loadEvals(root).find((x) => x.name === name)!;
  assert.deepEqual(e.tags, ['review', 'from-revert']);
  assert.equal(e.source?.commit, culprit);
  assert.match(e.description!, /Reviewer miss \(revert\): refactor: simplify ok/);
  assert.match(readFileSync(join(root, 'evals/fixtures/review', `${name}.patch`), 'utf8'), /-    return n <= MAX\n\+    return n < MAX/);
  assert.match((await sdlc(root, ['ci', 'capture-eval', '--reverts'])).out, /0 new reviewer eval\(s\) from 1 revert/);

  // the setup brings the bug back on a fresh checkout, as its own commit for the reviewer to read
  commitAll(root, 'captured');
  const wt = join(mkdtempSync(join(tmpdir(), 'sdlc-wt-')), 'wt');
  git(root, 'worktree', 'add', '-q', '--detach', wt, 'HEAD');
  execFileSync('sh', ['-c', e.setup!], { cwd: wt, env: { ...process.env, EVAL_DIR: join(root, 'evals'), EVAL_ROOT: wt } });
  assert.match(readFileSync(join(wt, 'src/limits.py'), 'utf8'), /n < MAX/);
  assert.equal(git(wt, 'log', '-1', '--format=%s'), 'refactor: simplify ok');
  assert.deepEqual(applyChecks(e, wt, 'f1 Important src/limits.py:4 off by one\nIMPORTANT_FINDINGS: 1', process.env, 'HEAD'), []);
  assert.deepEqual(applyChecks(e, wt, 'Looks good.\nIMPORTANT_FINDINGS: 0', process.env, 'HEAD'), ['output does not match /^\\W*IMPORTANT_FINDINGS:\\W*[1-9]/', "output does not contain 'limits.py'"]);
});

test('capture-eval <commit>: from an incident, with the finding that was expected', async () => {
  const { root, culprit } = reverted();
  const r = await sdlc(root, ['ci', 'capture-eval', culprit.slice(0, 10), '--expect', 'ok() rejects n == MAX', '--name', 'review-limit-off-by-one']);
  assert.equal(r.code, 0, r.err);
  const e = JSON.parse(readFileSync(join(root, 'evals/review-limit-off-by-one.json'), 'utf8'));
  assert.deepEqual(e.tags, ['review', 'from-incident']);
  assert.equal(e.source.expect, 'ok() rejects n == MAX');
  assert.match(e.description, /Expected finding: ok\(\) rejects n == MAX/);
  assert.match((await sdlc(root, ['ci', 'capture-eval', culprit])).out, /already captured/);
  assert.notEqual((await sdlc(root, ['ci', 'capture-eval', 'deadbeef'])).code, 0);
  assert.ok(!existsSync(join(root, 'evals/review-incident-deadbeef.json')));
});
