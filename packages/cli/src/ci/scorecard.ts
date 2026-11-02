// Agent parity: which agents the evals workflow can run (one per API key), and the eval × agent scorecard
// it publishes to docs/reference/agent-scorecard.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CI_AGENTS, type CiAgent } from '@ai-native-sdlc/core';
import type { EvalCase } from './evals.ts';

const KEY: Record<CiAgent, string[]> = {
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
  codex: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
  cursor: ['CURSOR_API_KEY'],
};

const NAME: Record<CiAgent, string> = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor' };

/** Agents with credentials in this environment; `only` (a workflow input) narrows it to one. */
export function matrixAgents(env: NodeJS.ProcessEnv, only?: string): CiAgent[] {
  const agents = CI_AGENTS.filter((a) => KEY[a].some((k) => env[k]));
  return only ? agents.filter((a) => a === only) : agents;
}

export interface EvalReport {
  agent: CiAgent;
  model?: string;
  rate: number;
  min: number;
  date?: string;
  results: { name: string; passed: boolean; failures: string[]; seconds?: number }[];
}

export const SCORECARD_START = '<!-- scorecard:start -->';
export const SCORECARD_END = '<!-- scorecard:end -->';

export function renderScorecard(reports: EvalReport[], evals: Pick<EvalCase, 'name' | 'tags'>[], date: string): string {
  const by = new Map(reports.map((r) => [r.agent, r]));
  const agents = CI_AGENTS.filter((a) => by.has(a));
  const summary = agents.map((a) => {
    const r = by.get(a)!;
    const passed = r.results.filter((x) => x.passed).length;
    return `| ${NAME[a]} | ${passed}/${r.results.length} (${Math.round(r.rate * 100)}%) | ${r.model || 'default'} | ${r.date ?? date} |`;
  });
  const names = [...new Set([...evals.map((e) => e.name), ...reports.flatMap((r) => r.results.map((x) => x.name))])].sort();
  const tags = new Map(evals.map((e) => [e.name, e.tags ?? []]));
  const rows = names.map((n) => {
    const cells = agents.map((a) => {
      const x = by.get(a)!.results.find((y) => y.name === n);
      return !x ? '—' : x.passed ? '✅' : '❌';
    });
    return `| ${n} | ${(tags.get(n) ?? []).join(', ')} | ${cells.join(' | ')} |`;
  });
  return [
    SCORECARD_START,
    '| Agent | Passed | Model | Date |',
    '|---|---|---|---|',
    ...summary,
    '',
    `| Eval | Tags | ${agents.map((a) => NAME[a]).join(' | ')} |`,
    `|---|---|${agents.map(() => '---').join('|')}|`,
    ...rows,
    SCORECARD_END,
  ].join('\n');
}

/** The table without dates, to tell a changed result from a re-run with the same result. */
const comparable = (block: string) =>
  block
    .split('\n')
    .map((l) => l.replace(/\| \d{4}-\d{2}-\d{2} \|$/, '|'))
    .join('\n');

/** Replaces the scorecard block in `file` when a result changed. Returns whether it wrote. */
export function updateScorecard(file: string, block: string): boolean {
  const doc = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const start = doc.indexOf(SCORECARD_START);
  const end = doc.indexOf(SCORECARD_END);
  if (start < 0 || end < 0) {
    writeFileSync(file, `${doc.trimEnd()}${doc ? '\n\n' : ''}${block}\n`);
    return true;
  }
  const old = doc.slice(start, end + SCORECARD_END.length);
  if (comparable(old) === comparable(block)) return false;
  writeFileSync(file, doc.slice(0, start) + block + doc.slice(end + SCORECARD_END.length));
  return true;
}
