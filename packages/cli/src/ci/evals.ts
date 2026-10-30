// `sdlc ci evals [pattern]`: regression tests for the agent configuration. Each evals/<name>.json runs in a
// throwaway detached worktree; its checks decide pass/fail. Fails when the pass rate is below the minimum.
// `setup` and `command` checks run with EVAL_DIR (the evals/ folder, for fixtures) and EVAL_ROOT (the worktree).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, globMatch, lines, SdlcError } from '@ai-native-sdlc/core';
import { runAgent } from './agent.ts';
import type { CiEnv } from './index.ts';

export type EvalCheck =
  | { type: 'command'; run: string; why?: string }
  | { type: 'diff_excludes'; glob: string; why?: string }
  | { type: 'diff_includes'; glob: string; why?: string }
  | { type: 'output_contains'; text: string; why?: string }
  | { type: 'file_matches'; glob: string; pattern: string; ignore_case?: boolean; why?: string };

export interface EvalCase {
  name: string;
  description?: string;
  prompt: string;
  /** Claude Code allowlist; other agents run with workspace-write. */
  allowed_tools?: string;
  /** Subdirectory of the repo the agent runs in (e.g. examples/python-api). */
  cwd?: string;
  /** Shell command run in `cwd` before the agent (fixtures, dependencies, a locked test…). */
  setup?: string;
  tags?: string[];
  checks: EvalCheck[];
}

export interface EvalResult {
  name: string;
  passed: boolean;
  failures: string[];
  seconds?: number;
}

/** Files the agent touched under `dir`, relative to it: modified, added, deleted and untracked. */
function touched(dir: string, base: string): string[] {
  const rel = ['--relative'];
  return [
    ...new Set([...lines(git(dir, ['diff', '--name-only', ...rel, base])), ...lines(git(dir, ['ls-files', '--others', '--exclude-standard']))]),
  ];
}

/** Only files the agent touched: templates and fixtures that already matched must not count. */
function filesMatching(dir: string, glob: string, base: string): string[] {
  return touched(dir, base).filter((f) => globMatch(f, glob) && existsSync(join(dir, f)));
}

/** `base` is the commit the agent started from (after setup). */
export function applyChecks(e: EvalCase, dir: string, output: string, env: NodeJS.ProcessEnv = process.env, base = 'HEAD'): string[] {
  const failures: string[] = [];
  for (const c of e.checks ?? []) {
    switch (c.type) {
      case 'command': {
        const r = spawnSync('sh', ['-c', c.run], { cwd: dir, env, stdio: 'ignore', timeout: 15 * 60_000 });
        if (r.status !== 0) failures.push(`command failed: ${c.run}`);
        break;
      }
      case 'diff_excludes': {
        const hit = touched(dir, base).find((f) => globMatch(f, c.glob));
        if (hit) failures.push(`diff touches ${c.glob} (${hit})`);
        break;
      }
      case 'diff_includes':
        if (!touched(dir, base).some((f) => globMatch(f, c.glob))) failures.push(`diff does not touch ${c.glob}`);
        break;
      case 'output_contains':
        if (!output.toLowerCase().includes(c.text.toLowerCase())) failures.push(`output does not contain '${c.text}'`);
        break;
      case 'file_matches': {
        const re = new RegExp(c.pattern, c.ignore_case ? 'mi' : 'm');
        if (!filesMatching(dir, c.glob, base).some((f) => re.test(readFileSync(join(dir, f), 'utf8')))) failures.push(`no file matching ${c.glob} contains /${c.pattern}/`);
        break;
      }
      default:
        failures.push(`unknown check: ${(c as { type: string }).type}`);
    }
  }
  return failures;
}

export function loadEvals(root: string, pattern = '*'): EvalCase[] {
  const dir = join(root, 'evals');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_') && globMatch(f.slice(0, -5), pattern))
    .sort()
    .map((f) => {
      const e = JSON.parse(readFileSync(join(dir, f), 'utf8')) as EvalCase;
      if (!e.prompt || !Array.isArray(e.checks)) throw new SdlcError(`evals/${f}: needs "prompt" and "checks"`);
      return { ...e, name: e.name ?? f.slice(0, -5) };
    });
}

export function runEvals(c: CiEnv, pattern?: string, out?: string): number {
  const evals = loadEvals(c.root, pattern);
  if (!evals.length) {
    console.log('No evals (only _example.json). Add real cases in evals/.');
    return 0;
  }
  const min = Number(c.env.EVAL_MIN_PASS_RATE ?? c.loaded?.config.ci?.min_pass_rate ?? 0.8);
  const results: EvalResult[] = [];
  for (const e of evals) {
    const wt = join(mkdtempSync(join(tmpdir(), 'sdlc-eval-')), 'wt');
    execFileSync('git', ['worktree', 'add', '-q', '--detach', wt, 'HEAD'], { cwd: c.root, stdio: 'ignore' });
    const dir = join(wt, e.cwd ?? '.');
    const env = { ...c.env, EVAL_DIR: join(c.root, 'evals'), EVAL_ROOT: wt, CLAUDE_PROJECT_DIR: dir, SDLC_PROJECT_DIR: dir };
    let failures: string[];
    const started = Date.now();
    try {
      if (!existsSync(dir)) throw new SdlcError(`cwd ${e.cwd} does not exist`);
      if (e.setup) {
        const r = spawnSync('sh', ['-c', e.setup], { cwd: dir, env, encoding: 'utf8', timeout: 15 * 60_000 });
        if (r.status !== 0) throw new SdlcError(`setup failed: ${(r.stderr || r.stdout).trim().slice(0, 500)}`);
      }
      const base = git(wt, ['rev-parse', 'HEAD']) ?? 'HEAD';
      const output = runAgent(c.agent, { mode: 'edit', cwd: dir, prompt: e.prompt, allowedTools: e.allowed_tools ?? 'Read,Edit,Write,Grep,Glob' }, c.model, env);
      failures = applyChecks(e, dir, output, env, base);
    } catch (err) {
      failures = [(err as Error).message];
    } finally {
      git(c.root, ['worktree', 'remove', '--force', wt]);
      rmSync(join(wt, '..'), { recursive: true, force: true });
    }
    results.push({ name: e.name, passed: !failures.length, failures, seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`${failures.length ? 'FAIL' : 'PASS'} ${e.name}`);
    for (const f of failures) console.log(`  ${f}`);
  }
  const passed = results.filter((r) => r.passed).length;
  const rate = passed / results.length;
  console.log(`pass rate: ${passed}/${results.length} = ${rate.toFixed(2)} (minimum ${min})`);
  if (out) writeFileSync(out, JSON.stringify({ agent: c.agent, model: c.model, rate, min, results }, null, 2) + '\n');
  return rate >= min ? 0 : 1;
}
