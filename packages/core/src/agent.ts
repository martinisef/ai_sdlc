// Headless agent runs (CI, dashboard jobs): one prompt in, the final answer out.
// Claude Code is the reference; Codex and Cursor's CLI are supported best-effort (their permission models are coarser:
// read-only vs workspace-write sandbox for Codex, proposal vs --force for Cursor).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { CI_AGENTS, type CiAgent, type LoadedConfig } from './config.ts';
import { hasTool, SdlcError } from './http.ts';

export interface AgentTask {
  prompt: string;
  /** read: inspect only · edit: may change files in the working tree and commit. */
  mode: 'read' | 'edit';
  /** Claude Code tool allowlist; ignored by agents without one. */
  allowedTools?: string;
  cwd: string;
  /** Receives the agent's stderr instead of the terminal (dashboard jobs). */
  log?: (chunk: string) => void;
  signal?: AbortSignal;
}

export const READ_TOOLS = 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*)';

export function pickAgent(flag: string | undefined, loaded: LoadedConfig | undefined, env = process.env): CiAgent {
  const a = flag || env.SDLC_CI_AGENT || loaded?.config.ci?.agent || 'claude';
  if (!(CI_AGENTS as readonly string[]).includes(a)) throw new SdlcError(`unknown agent '${a}' (one of: ${CI_AGENTS.join(', ')})`);
  return a as CiAgent;
}

/**
 * The agent for work started on this machine (dashboard jobs): an explicit choice wins, then the first of the
 * project's `agents` whose CLI is installed, then any installed CLI. Defaults to claude so the error names one.
 */
export function localAgent(loaded: LoadedConfig | undefined, env = process.env): CiAgent {
  if (env.SDLC_CI_AGENT || loaded?.config.ci?.agent) return pickAgent(undefined, loaded, env);
  const fromConfig = (loaded?.config.agents ?? []).map((a): CiAgent => (a === 'agents-md' ? 'codex' : a));
  const order = [...new Set<CiAgent>([...fromConfig, 'claude', 'cursor', 'codex'])];
  return order.find((a) => hasTool(agentBin(a, env), env)) ?? 'claude';
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

/** The provider refused the account (no quota or credit, bad key): every run fails the same way, it says nothing about the agent. */
export class AgentAccountError extends SdlcError {}

const ACCOUNT_ERROR = /quota exceeded|insufficient_quota|exceeded your current quota|credit balance is too low|invalid api key|incorrect api key|invalid x-api-key|authentication_error/i;

function accountError(bin: string, stderr: string): AgentAccountError | undefined {
  const line = stderr.split('\n').find((l) => ACCOUNT_ERROR.test(l));
  if (!line) return undefined;
  const reason = line.replace(/\b(sk|key|ghp|crsr)[-_][A-Za-z0-9_*.-]+/gi, '***').trim().slice(0, 200);
  return new AgentAccountError(`${bin}: the provider refused the account (${reason}); check the API key and its plan or billing`);
}

const failure = (bin: string, error: Error | undefined, status: number | null, stderr = ''): SdlcError | undefined =>
  error
    ? new SdlcError(`${bin}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not installed (run: sdlc ci bootstrap)' : error.message}`)
    : status !== 0
      ? (accountError(bin, stderr) ?? new SdlcError(`${bin} exited with ${status}`))
      : undefined;

const STDERR_TAIL = 16 * 1024;

export function runAgent(agent: CiAgent, task: AgentTask, model?: string, env = process.env): string {
  const inv = invocation(agent, task, model, env);
  try {
    const r = spawnSync(inv.bin, inv.args, { cwd: task.cwd, env: inv.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    if (r.stderr) process.stderr.write(r.stderr);
    const err = failure(inv.bin, r.error, r.status, r.stderr?.slice(-STDERR_TAIL));
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
    const child = spawn(inv.bin, inv.args, { cwd: task.cwd, env: inv.env, stdio: ['ignore', 'pipe', 'pipe'], signal: task.signal });
    let stdout = '';
    let stderr = '';
    child.stderr?.setEncoding('utf8').on('data', (d: string) => {
      stderr = (stderr + d).slice(-STDERR_TAIL);
      if (task.log) task.log(d);
      else process.stderr.write(d);
    });
    let spawnError: Error | undefined;
    child.stdout?.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.on('error', (e) => (spawnError = e));
    child.on('close', (status) => {
      const err = failure(inv.bin, spawnError, spawnError ? null : status, stderr);
      if (err) reject(err);
      else resolve(answer(inv, stdout));
    });
  }).finally(() => rmSync(inv.tmp, { recursive: true, force: true }));
}
