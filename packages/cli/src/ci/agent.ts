// Headless agent runs for CI: one prompt in, the final answer out.
// Claude Code is the reference; Codex and Cursor's CLI are supported best-effort (their permission models are coarser:
// read-only vs workspace-write sandbox for Codex, proposal vs --force for Cursor).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CI_AGENTS, SdlcError, type CiAgent, type LoadedConfig } from '@ai-native-sdlc/core';

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

/** How to point the agent at a skill: Claude resolves skills by name; the others read the rendered SKILL.md. */
export function skillRef(agent: CiAgent, name: string): string {
  return agent === 'claude' ? `the ${name} skill` : `the skill in .agents/skills/${name}/SKILL.md`;
}

export function runAgent(agent: CiAgent, task: AgentTask, model?: string, env = process.env): string {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-agent-'));
  try {
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
        args = ['exec', '--sandbox', task.mode === 'edit' ? 'workspace-write' : 'read-only', '--output-last-message', lastMessage];
        if (model) args.push('-m', model);
        args.push(task.prompt);
        break;
      case 'cursor':
        args = ['-p', '--output-format', 'text'];
        if (task.mode === 'edit') args.push('--force');
        if (model) args.push('--model', model);
        args.push(task.prompt);
        break;
    }
    const r = spawnSync(AGENT_BIN[agent], args, { cwd: task.cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw new SdlcError(`${AGENT_BIN[agent]}: ${(r.error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not installed (run: sdlc ci bootstrap)' : r.error.message}`);
    if (r.status !== 0) throw new SdlcError(`${AGENT_BIN[agent]} exited with ${r.status}`);
    if (lastMessage) {
      try {
        return readFileSync(lastMessage, 'utf8').trim();
      } catch {
        /* older codex: fall back to stdout */
      }
    }
    return r.stdout.trim();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
