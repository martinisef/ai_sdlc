// Health checks and the enforcement matrix: what each guardrail really guarantees per agent.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BANDS_PATH, detectProvider, git, loadBands, loadConfig, type AgentId } from '@ai-native-sdlc/core';
import { detectDrift } from './render.ts';

export type Enforcement = 'blocks' | 'post-hoc' | 'commit' | 'push' | 'ci' | 'advisory';

export interface MatrixRow {
  guardrail: string;
  claude: Enforcement[];
  cursor: Enforcement[];
  'agents-md': Enforcement[];
}

/** Ordered strongest first. "commit"/"push" come from the git hooks every agent shares. */
export const ENFORCEMENT_MATRIX: MatrixRow[] = [
  { guardrail: 'protected-paths', claude: ['blocks', 'commit'], cursor: ['blocks', 'commit'], 'agents-md': ['commit'] },
  { guardrail: 'test-lock', claude: ['blocks', 'commit'], cursor: ['blocks', 'commit'], 'agents-md': ['commit'] },
  { guardrail: 'secrets', claude: ['blocks', 'commit'], cursor: ['blocks', 'commit'], 'agents-md': ['commit'] },
  { guardrail: 'production-gate', claude: ['blocks'], cursor: ['blocks'], 'agents-md': ['ci', 'advisory'] },
  { guardrail: 'format-on-edit', claude: ['post-hoc'], cursor: ['post-hoc'], 'agents-md': ['advisory'] },
  { guardrail: 'plan-sync', claude: ['blocks'], cursor: ['blocks'], 'agents-md': ['advisory'] },
  { guardrail: 'plan-first', claude: ['advisory', 'push'], cursor: ['advisory', 'push'], 'agents-md': ['advisory', 'push'] },
];

export interface Check {
  id: string;
  ok: boolean;
  level: 'error' | 'warn' | 'info';
  message: string;
}

function has(bin: string): boolean {
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function doctor(root: string): { checks: Check[]; agents: AgentId[]; matrix: MatrixRow[] } {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, message: string, level: Check['level'] = ok ? 'info' : 'error') => checks.push({ id, ok, level, message });
  const loaded = loadConfig(root);
  const isGit = git(root, ['rev-parse', '--git-dir']) !== undefined;
  add('git', isGit, isGit ? 'git repository' : 'not a git repository (artifacts and gates live in git)');
  if (!loaded) {
    add('config', false, 'no .sdlc/config.json — run `sdlc init`');
    return { checks, agents: [], matrix: ENFORCEMENT_MATRIX };
  }
  add('config', loaded.issues.length === 0, loaded.issues.length ? `${loaded.path}: ${loaded.issues.join('; ')}` : `${loaded.path} valid`);
  if (loaded.legacy) add('config-legacy', false, 'using legacy .claude/sdlc.json — run `sdlc migrate`', 'warn');
  const agents = loaded.config.agents ?? ['claude'];
  const cmds = loaded.config.commands ?? {};
  for (const k of ['build', 'test', 'lint'] as const) {
    add(`command.${k}`, !!cmds[k], cmds[k] ? `${k}: ${cmds[k]}` : `commands.${k} missing: the agent has no way to verify its work`, cmds[k] ? 'info' : 'warn');
  }
  if (isGit) {
    const hp = git(root, ['config', '--local', 'core.hooksPath']);
    add('git-hooks', hp === '.sdlc/git-hooks', hp === '.sdlc/git-hooks' ? 'git hooks installed (.sdlc/git-hooks)' : hp ? `core.hooksPath=${hp}: make sure it calls .sdlc/bin/sdlc hook pre-commit/pre-push` : 'git hooks not installed — run `sdlc sync`', hp && hp !== '.sdlc/git-hooks' ? 'warn' : undefined);
  }
  add('shim', existsSync(join(root, '.sdlc/bin/sdlc')), existsSync(join(root, '.sdlc/bin/sdlc')) ? '.sdlc/bin/sdlc present' : '.sdlc/bin/sdlc missing — run `sdlc sync`');
  const localCli = existsSync(join(root, 'node_modules/.bin/sdlc'));
  const envCli = process.env.SDLC_BIN;
  const found = Boolean(envCli) || localCli || has('sdlc');
  add('cli', found, envCli ? `sdlc CLI from SDLC_BIN (${envCli})` : localCli ? 'sdlc CLI in node_modules' : has('sdlc') ? 'sdlc CLI on PATH' : 'sdlc CLI not installed: hooks fail open. `npm i -D @morsadev/sdlc` (or global)', found ? 'info' : 'warn');
  if (agents.includes('cursor')) add('cursor', existsSync(join(root, '.cursor/hooks.json')), existsSync(join(root, '.cursor/hooks.json')) ? 'Cursor hooks configured' : 'Cursor enabled but .cursor/hooks.json missing — run `sdlc sync`');
  if (agents.includes('agents-md')) add('agents-md', existsSync(join(root, 'AGENTS.md')), existsSync(join(root, 'AGENTS.md')) ? 'AGENTS.md present' : 'AGENTS.md missing — run `sdlc sync`');
  const provider = detectProvider(root, loaded);
  add('vcs', !!provider, provider ? `VCS provider: ${provider}` : 'VCS provider unknown (vcs.provider or an origin remote)', provider ? 'info' : 'warn');
  if (provider === 'github') add('gh', has('gh'), has('gh') ? 'gh installed' : 'gh not installed: PR status unavailable', has('gh') ? 'info' : 'warn');
  if (provider === 'gitlab') add('glab', has('glab'), has('glab') ? 'glab installed' : 'glab not installed: MR status unavailable', has('glab') ? 'info' : 'warn');
  if (existsSync(join(root, BANDS_PATH))) {
    try {
      const n = loadBands(root)?.bands.length ?? 0;
      add('bands', true, n ? `${BANDS_PATH}: ${n} band(s) (sdlc bands check --dry-run to read them)` : `${BANDS_PATH}: no bands yet (Stage 6 off)`);
    } catch (e) {
      add('bands', false, (e as Error).message);
    }
  }
  const drift = detectDrift(root);
  add('drift', drift.length === 0, drift.length ? `generated files edited by hand: ${drift.join(', ')} (sdlc sync --force to regenerate)` : 'generated files in sync', drift.length ? 'warn' : 'info');
  return { checks, agents, matrix: ENFORCEMENT_MATRIX };
}
