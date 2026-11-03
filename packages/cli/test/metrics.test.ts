// `sdlc metrics`: the PR cache (review rounds, human comments) and single values for control bands.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitAll, project, sdlc } from './helpers.ts';

const comment = (o: object) => JSON.stringify({ createdAt: '2026-11-01T00:00:00Z', ...o }) + '\n';
const state = (kind: string, round: number) =>
  `<!-- sdlc:${kind}-summary -->\n<!-- sdlc:${kind}-state ${Buffer.from(JSON.stringify({ round, sha: 'a', findings: [] })).toString('base64')} -->`;

function withPr() {
  const root = project({ vcs: { provider: 'github', default_branch: 'main' } });
  execFileSync('git', ['checkout', '-qb', 'change/x'], { cwd: root });
  mkdirSync(join(root, 'changes/2026-11-x'), { recursive: true });
  writeFileSync(join(root, 'changes/2026-11-x/intent.md'), '---\nstatus: draft\n---\n# Intent\n');
  commitAll(root, 'intent');
  execFileSync('git', ['checkout', '-q', 'main'], { cwd: root });
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-gh-'));
  writeFileSync(
    join(dir, 'issues_7_comments'),
    comment({ id: '1', author: 'github-actions[bot]', association: 'NONE', body: `## Automated review (ai-sdlc)\n${state('review', 2)}` }) +
      comment({ id: '2', author: 'github-actions[bot]', association: 'NONE', body: `## Security review (ai-sdlc)\n${state('security', 3)}` }) +
      comment({ id: '3', author: 'ana', association: 'MEMBER', body: 'resolved f1: intentional' }) +
      comment({ id: '4', author: 'claude[bot]', association: 'NONE', body: 'on it' }),
  );
  writeFileSync(join(dir, 'pulls_7_comments'), comment({ id: '5', author: 'bob', association: 'MEMBER', body: 'why not reuse parse()?', path: 'src/a.py', line: 3 }));
  return { root, env: { STUB_LOG: join(dir, 'log'), STUB_GH_DIR: dir, STUB_PR_LIST: '[{"number":7,"url":"https://github.com/acme/app/pull/7","state":"OPEN","isDraft":false,"title":"x"}]' } };
}

test('metrics --prs: review rounds from the review and security state, comments only from people', async () => {
  const { root, env } = withPr();
  const r = await sdlc(root, ['metrics', '--prs', '--json'], env);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /pr-stats.json: 1 PR/);
  const cache = JSON.parse(readFileSync(join(root, '.sdlc/pr-stats.json'), 'utf8'));
  assert.deepEqual(cache.changes['changes/2026-11-x'], { pr: 7, rounds: 3, humanComments: 2 });
  const m = JSON.parse(r.out);
  assert.equal(m.changes[0].reviewRounds, 3);
  assert.deepEqual(m.summary.humanComments, { median: 2, p95: 2 });

  const v = await sdlc(root, ['metrics', '--value', 'review_rounds_median']);
  assert.equal(v.out, '3', 'read from the cache, no forge call');
});

test('metrics --value: a number per line for a band; unknown names and empty data fail', async () => {
  const root = project({});
  writeFileSync(join(root, 'a.txt'), 'x');
  commitAll(root, 'feat: x');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'revert', '--no-edit', 'HEAD'], { cwd: root, stdio: 'ignore' });
  assert.equal((await sdlc(root, ['metrics', '--value', 'reverts', '--since', '30d'])).out, '1');
  assert.equal((await sdlc(root, ['metrics', '--value', 'revert_rate'])).out, '0.5');
  const bad = await sdlc(root, ['metrics', '--value', 'nope']);
  assert.notEqual(bad.code, 0);
  assert.match(bad.err, /unknown metric nope \(revert_rate, /);
  assert.match((await sdlc(root, ['metrics', '--value', 'waiting_hours_p95'])).err, /no data yet/);
  assert.match((await sdlc(root, ['metrics', '--since', 'soon'])).err, /invalid duration/);
});
