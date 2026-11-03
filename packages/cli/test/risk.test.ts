// `sdlc risk` and `sdlc ci risk` against the gh and claude stubs.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitAll, project, sdlc } from './helpers.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'sdlc-stub-'));
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

function riskRepo() {
  const root = project({ vcs: { provider: 'github' }, risk: { high_risk_paths: ['src/auth/**'] } }, 'change/export');
  mkdirSync(join(root, 'changes/2026-11-export'), { recursive: true });
  writeFileSync(join(root, 'changes/2026-11-export/intent.md'), '---\nstatus: accepted\n---\n# Intent: export\n');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/export.ts'), 'export const x = 1;\n');
  commitAll(root, 'export');
  return root;
}

test('sdlc risk: tier and reasons for the active change', async () => {
  const root = riskRepo();
  const low = await sdlc(root, ['risk', '--json']);
  assert.equal(low.code, 0, low.err);
  assert.equal(JSON.parse(low.out).tier, 'low');
  mkdirSync(join(root, 'src/auth'));
  writeFileSync(join(root, 'src/auth/session.ts'), 'export {};\n');
  commitAll(root, 'auth');
  const high = await sdlc(root, ['risk']);
  assert.match(high.out, /^changes\/2026-11-export: high risk \(\d+ files against main/);
  assert.match(high.out, /high {3}src\/auth\/session.ts is a high-risk path \(src\/auth\/\*\*\)/);
});

test('ci risk: sticky comment and risk.json; dry run prints', async () => {
  const root = riskRepo();
  const dir = tmp();
  const log = join(dir, 'calls.log');
  const r = await sdlc(root, ['ci', 'risk'], { STUB_LOG: log, STUB_GH_DIR: dir, PR_NUMBER: '7', HEAD_REF: 'change/export', BASE_REF: 'main' });
  assert.equal(r.code, 0, r.err);
  assert.match(read(log), /gh pr comment 7 --body ## Risk \(ai-sdlc\)\n\n\*\*Tier: low\*\*/);
  assert.equal(JSON.parse(read(join(root, 'risk.json'))).tier, 'low');
  assert.doesNotMatch(read(log), /claude/, 'no agent without --escalate or risk.agent_escalation');

  writeFileSync(join(dir, 'issues_7_comments'), JSON.stringify({ id: '99', author: 'github-actions[bot]', body: '## Risk (ai-sdlc)\n<!-- sdlc:risk-summary -->', createdAt: '2026-11-01T00:00:00Z' }) + '\n');
  await sdlc(root, ['ci', 'risk'], { STUB_LOG: log, STUB_GH_DIR: dir, PR_NUMBER: '7', HEAD_REF: 'change/export', BASE_REF: 'main' });
  assert.match(read(log), /gh api -X PATCH repos\/\{owner\}\/\{repo\}\/issues\/comments\/99 -f body=## Risk/, 'edits the sticky comment');
});

test('ci risk --escalate: the second classifier can raise the tier and leaves the marker', async () => {
  const root = riskRepo();
  const dir = tmp();
  const log = join(dir, 'calls.log');
  const r = await sdlc(root, ['ci', 'risk', '--escalate', '--dry-run'], { STUB_LOG: log, PR_NUMBER: '7', HEAD_REF: 'change/export', BASE_REF: 'main' });
  assert.equal(r.code, 0, r.err);
  assert.match(read(log), /claude -p You are the second risk classifier/);
  assert.match(r.out, /\*\*Tier: high\*\*/);
  assert.match(r.out, /second classifier: session expiry is an auth boundary/);
  assert.match(r.out, /<!-- sdlc:risk tier=high reason="session expiry is an auth boundary" -->/);
});
