// Headless agent runs for CI: one prompt in, the final answer out.
// Claude Code is the reference; Codex and Cursor's CLI are supported best-effort (their permission models are coarser:
// read-only vs workspace-write sandbox for Codex, proposal vs --force for Cursor).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { CI_AGENTS, hasTool, SdlcError, type CiAgent, type LoadedConfig } from '@ai-native-sdlc/core';

export interface AgentTask {
  prompt: string;
  /** read: inspect only · edit: may change files in the working tree and commit. */
  mode: 'read' | 'edit';
  /** Claude Code tool allowlist; ignored by agents without one. */
  allowedTools?: string;
  cwd: string;
}

export const READ_TOOLS = 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*)';

export function pickAgent(flag: string | undefined, loaded: LoadedConfig | undefined, env = process.env): CiAgent {
  const a = flag || env.SDLC_CI_AGENT || loaded?.config.ci?.agent || 'claude';
  if (!(CI_AGENTS as readonly string[]).includes(a)) throw new SdlcError(`unknown agent '${a}' (one of: ${CI_AGENTS.join(', ')})`);
  return a as CiAgent;
}

export const AGENT_BIN: Record<CiAgent, string> = { claude: 'claude', codex: 'codex', cursor: 'cursor-agent' };

/** The executable to run. Cursor's installer puts `agent` (and the older `cursor-agent`) in ~/.local/bin, often not on PATH yet. */
export function agentBin(agent: CiAgent, env: NodeJS.ProcessEnv = process.env): string {
  if (agent !== 'cursor') return AGENT_BIN[agent];
  const local = join(env.HOME ?? homedir(), '.local/bin');
  return ['cursor-agent', 'agent', join(local, 'cursor-agent'), join(local, 'agent')].find((b) => hasTool(b, env)) ?? AGENT_BIN.cursor;
}

/** How to point the agent at a skill: Claude resolves skills by name; the others read the rendered SKILL.md. */
export function skillRef(agent: CiAgent, name: string): string {
  return agent === 'claude' ? `the ${name} skill` : `the skill in .agents/skills/${name}/SKILL.md`;
}

interface Invocation {
  bin: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  tmp: string;
  lastMessage?: string;
}

function invocation(agent: CiAgent, task: AgentTask, model: string | undefined, env: NodeJS.ProcessEnv): Invocation {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-agent-'));
  let args: string[];
  let lastMessage: string | undefined;
  switch (agent) {
    case 'claude':
      args = ['-p', task.prompt, '--allowedTools', task.allowedTools ?? READ_TOOLS];
      if (task.mode === 'edit') args.push('--permission-mode', 'acceptEdits');
      if (model) args.push('--model', model);
      break;
    case 'codex':
      lastMessage = join(tmp, 'last.md');
      // workspace-write keeps .git read-only and has no network, so on an (ephemeral) CI runner edit mode could
      // neither commit nor install dependencies; there the guardrails are the git hooks and the pipeline
      args = ['exec', '--sandbox', task.mode !== 'edit' ? 'read-only' : env.CI ? 'danger-full-access' : 'workspace-write', '--output-last-message', lastMessage];
      if (model) args.push('-m', model);
      args.push(task.prompt);
      break;
    case 'cursor':
      // --trust: headless runs cannot answer the workspace-trust prompt; ask mode is Cursor's read-only mode
      args = ['-p', '--output-format', 'text', '--trust', '--workspace', task.cwd];
      args.push(...(task.mode === 'edit' ? ['--force'] : ['--mode', 'ask']));
      if (model) args.push('--model', model);
      args.push(task.prompt);
      break;
  }
  // `codex exec` authenticates non-interactively with CODEX_API_KEY
  if (agent === 'codex' && !env.CODEX_API_KEY && env.OPENAI_API_KEY) env = { ...env, CODEX_API_KEY: env.OPENAI_API_KEY };
  return { bin: agentBin(agent, env), args, env, tmp, lastMessage };
}

function answer(inv: Invocation, stdout: string): string {
  if (inv.lastMessage) {
    try {
      return readFileSync(inv.lastMessage, 'utf8').trim();
    } catch {
      /* older codex: fall back to stdout */
    }
  }
  return stdout.trim();
}

const failure = (bin: string, error: Error | undefined, status: number | null): SdlcError | undefined =>
  error
    ? new SdlcError(`${bin}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not installed (run: sdlc ci bootstrap)' : error.message}`)
    : status !== 0
      ? new SdlcError(`${bin} exited with ${status}`)
      : undefined;

export function runAgent(agent: CiAgent, task: AgentTask, model?: string, env = process.env): string {
  const inv = invocation(agent, task, model, env);
  try {
    const r = spawnSync(inv.bin, inv.args, { cwd: task.cwd, env: inv.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
    const err = failure(inv.bin, r.error, r.status);
    if (err) throw err;
    return answer(inv, r.stdout);
  } finally {
    rmSync(inv.tmp, { recursive: true, force: true });
  }
}

/** Same as runAgent without blocking, so independent runs (review finders, verifier votes) go in parallel. */
export function runAgentAsync(agent: CiAgent, task: AgentTask, model?: string, env = process.env): Promise<string> {
  const inv = invocation(agent, task, model, env);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(inv.bin, inv.args, { cwd: task.cwd, env: inv.env, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    let spawnError: Error | undefined;
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.on('error', (e) => (spawnError = e));
    child.on('close', (status) => {
      const err = failure(inv.bin, spawnError, spawnError ? null : status);
      if (err) reject(err);
      else resolve(answer(inv, stdout));
    });
  }).finally(() => rmSync(inv.tmp, { recursive: true, force: true }));
}
