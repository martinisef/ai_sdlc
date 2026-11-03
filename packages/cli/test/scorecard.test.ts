import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEvals } from '../src/ci/evals.ts';
import { matrixAgents, renderScorecard, updateScorecard, type EvalReport } from '../src/ci/scorecard.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');

test('matrixAgents: one agent per credential, narrowed by the workflow input', () => {
  assert.deepEqual(matrixAgents({ OPENAI_API_KEY: 'x' }), ['codex']);
  assert.deepEqual(matrixAgents({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'x', CURSOR_API_KEY: 'c' }), ['claude', 'codex', 'cursor']);
  assert.deepEqual(matrixAgents({ CLAUDE_CODE_OAUTH_TOKEN: 't', OPENAI_API_KEY: '' }), ['claude']);
  assert.deepEqual(matrixAgents({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'x' }, 'codex'), ['codex']);
  assert.deepEqual(matrixAgents({}, 'claude'), []);
});

const report = (agent: EvalReport['agent'], passed: Record<string, boolean>, date = '2026-11-02'): EvalReport => ({
  agent,
  rate: Object.values(passed).filter(Boolean).length / Object.keys(passed).length,
  min: 0.8,
  date,
  results: Object.entries(passed).map(([name, ok]) => ({ name, passed: ok, failures: ok ? [] : ['x'] })),
});
const EVALS = [
  { name: 'py-production-gate', tags: ['guardrail', 'production-gate'] },
  { name: 'py-intent', tags: ['loop'] },
];

test('renderScorecard: summary per agent and an eval × agent table', () => {
  const block = renderScorecard([report('codex', { 'py-production-gate': true, 'py-intent': false }), report('claude', { 'py-production-gate': true })], EVALS, '2026-11-02');
  assert.equal(
    block,
    [
      '<!-- scorecard:start -->',
      '| Agent | Passed | Model | Date |',
      '|---|---|---|---|',
      '| Claude Code | 1/1 (100%) | default | 2026-11-02 |',
      '| Codex | 1/2 (50%) | default | 2026-11-02 |',
      '',
      '| Eval | Tags | Claude Code | Codex |',
      '|---|---|---|---|',
      '| py-intent | loop | — | ❌ |',
      '| py-production-gate | guardrail, production-gate | ✅ | ✅ |',
      '<!-- scorecard:end -->',
    ].join('\n'),
  );
});

test('updateScorecard: writes the block once, ignores re-runs with the same results, rewrites on a change', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'sdlc-scorecard-')), 'agent-scorecard.md');
  writeFileSync(file, '# Agent scorecard\n\nIntro.\n');
  const first = renderScorecard([report('codex', { 'py-intent': true })], EVALS, '2026-11-02');
  assert.equal(updateScorecard(file, first), true);
  assert.match(readFileSync(file, 'utf8'), /^# Agent scorecard\n\nIntro\.\n\n<!-- scorecard:start -->/);
  assert.equal(updateScorecard(file, renderScorecard([report('codex', { 'py-intent': true }, '2026-11-09')], EVALS, '2026-11-09')), false, 'only the date changed');
  assert.equal(updateScorecard(file, renderScorecard([report('codex', { 'py-intent': false }, '2026-11-09')], EVALS, '2026-11-09')), true);
  assert.match(readFileSync(file, 'utf8'), /Intro\.\n\n<!-- scorecard:start -->[\s\S]*❌[\s\S]*<!-- scorecard:end -->\n$/);
});

test('loadEvals --tags: the release gate set (guardrail, gates) from the real evals', () => {
  const gate = loadEvals(REPO, '*', ['guardrail', 'gates']).map((e) => e.name);
  assert.ok(gate.includes('py-production-gate') && gate.includes('py-spec-refuses-draft-intent'));
  assert.ok(!gate.includes('py-intent'));
  assert.equal(gate.length, new Set(gate).size);
});

test('renderScorecard: the reviewer apart (clean PRs, problems caught) and comment outcomes on real PRs', () => {
  const evals = [
    { name: 'py-review-finds-x', tags: ['review'] },
    { name: 'review-revert-1a2b3c4d', tags: ['review', 'from-revert'] },
    { name: 'ts-review-clean-a', tags: ['review', 'clean'] },
    { name: 'ts-review-clean-b', tags: ['review', 'clean'] },
  ];
  const r = report('claude', { 'py-review-finds-x': true, 'review-revert-1a2b3c4d': false, 'ts-review-clean-a': true, 'ts-review-clean-b': false });
  const block = renderScorecard([r], evals, '2026-11-02', { prs: 4, totals: { fixed: 6, wrong: 1, intentional: 2, ignored: 1, open: 3 } });
  assert.match(block, /\| Reviewer \| Clean PRs without false positives \| Problems caught \|\n\|---\|---\|---\|\n\| Claude Code \| 1\/2 \| 1\/2 \|/);
  assert.match(block, /Comment outcomes on 4 real PRs: fixed 6 · intentional 2 · wrong 1 · ignored 1 · open 3\n<!-- scorecard:end -->$/);
  assert.doesNotMatch(renderScorecard([report('codex', { 'py-intent': true })], EVALS, '2026-11-02'), /Reviewer/, 'no review evals, no section');
});
