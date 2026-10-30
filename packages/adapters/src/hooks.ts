// Hook protocol adapters: agent payload → HookEvent → core.evaluate → agent response.
import { evaluate, loadConfig, projectDir, recordEvent, type Decision, type HookEvent, type LoadedConfig } from '@ai-native-sdlc/core';

export interface HookOutput {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

type Payload = Record<string, any>;

// ---------- Claude Code ----------
// https://code.claude.com/docs/en/hooks — PreToolUse/PostToolUse/Stop: exit 2 + stderr is fed back to Claude.

const CLAUDE_EVENTS: Record<string, string> = {
  PreToolUse: 'pre-tool',
  PostToolUse: 'post-tool',
  Stop: 'stop',
  SubagentStop: 'stop',
  SessionStart: 'session-start',
};

function editedContent(input: Payload): string | undefined {
  const parts = [input.content, input.new_string, input.new_source, ...((input.edits ?? []) as Payload[]).map((e) => e.new_string)];
  const s = parts.filter((p) => typeof p === 'string').join('\n');
  return s || undefined;
}

export function claudeEvent(name: string | undefined, p: Payload): HookEvent | undefined {
  const ev = name ?? CLAUDE_EVENTS[p.hook_event_name] ?? 'pre-tool';
  if (ev === 'session-start') return { kind: 'session.start' };
  if (ev === 'stop') return { kind: 'session.stop', stopHookActive: p.stop_hook_active === true };
  const input: Payload = p.tool_input ?? {};
  const tool: string | undefined = p.tool_name;
  const path = input.file_path ?? input.notebook_path;
  const isEdit = tool ? /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool) : !!path;
  if (isEdit && path) return { kind: 'file.edit', phase: ev === 'post-tool' ? 'post' : 'pre', path, content: editedContent(input) };
  if ((tool === 'Bash' || (!tool && input.command)) && ev === 'pre-tool') return { kind: 'shell.exec', command: input.command ?? '' };
  return undefined;
}

export function claudeOutput(decisions: Decision[]): HookOutput {
  const deny = decisions.find((d) => d.action === 'deny');
  if (deny && deny.action === 'deny') return { stderr: deny.message, exitCode: 2 };
  const warns = decisions.flatMap((d) => (d.action === 'warn' ? [d.message] : []));
  if (warns.length) return { stderr: warns.join('\n'), exitCode: 2 };
  const ctx = decisions.flatMap((d) => (d.action === 'context' ? [d.message] : []));
  return { stdout: ctx.length ? ctx.join('\n') : undefined, exitCode: 0 };
}

// ---------- Cursor ----------
// Cursor hooks (.cursor/hooks.json): JSON on stdin, JSON on stdout. `preToolUse`/`before*` hooks answer with a
// permission; `stop` can send a follow-up message back to the agent; `after*` hooks cannot block.
// Every file edit (create or replace) reaches preToolUse as `Write` with the full resulting `content`.

export function cursorEvent(name: string | undefined, p: Payload): HookEvent | undefined {
  switch (name ?? p.hook_event_name) {
    case 'preToolUse': {
      const path = p.tool_input?.file_path;
      if (!path || !/^(Write|Delete)$/.test(p.tool_name ?? '')) return undefined;
      return { kind: 'file.edit', phase: 'pre', path, content: p.tool_name === 'Write' ? p.tool_input.content : undefined };
    }
    case 'beforeShellExecution':
      return { kind: 'shell.exec', command: p.command ?? '' };
    case 'beforeReadFile':
      return { kind: 'file.read', path: p.file_path ?? '', content: p.content };
    case 'beforeSubmitPrompt':
      return { kind: 'prompt', text: p.prompt ?? '' };
    case 'afterFileEdit':
      return { kind: 'file.edit', phase: 'post', path: p.file_path ?? '', content: editedContent(p) };
    case 'stop':
      return { kind: 'session.stop', stopHookActive: (p.loop_count ?? 0) > 0 || p.status === 'aborted' };
    case 'sessionStart':
      return { kind: 'session.start' };
    default:
      return undefined;
  }
}

export function cursorOutput(name: string, decisions: Decision[]): HookOutput {
  const deny = decisions.find((d) => d.action === 'deny');
  const warns = decisions.flatMap((d) => (d.action === 'warn' ? [d.message] : []));
  if (name === 'stop') {
    return { stdout: JSON.stringify(warns.length ? { followup_message: warns.join('\n') } : {}), exitCode: 0 };
  }
  if (name === 'beforeSubmitPrompt') {
    return { stdout: JSON.stringify(deny && deny.action === 'deny' ? { continue: false, user_message: deny.message } : { continue: true }), exitCode: 0 };
  }
  if (name === 'sessionStart') {
    const ctx = decisions.flatMap((d) => (d.action === 'context' ? [d.message] : []));
    return { stdout: JSON.stringify(ctx.length ? { additional_context: ctx.join('\n') } : {}), exitCode: 0 };
  }
  if (name.startsWith('before') || name === 'preToolUse') {
    const body =
      deny && deny.action === 'deny'
        ? { permission: 'deny', user_message: deny.message, agent_message: deny.message }
        : { permission: 'allow' };
    return { stdout: JSON.stringify(body), exitCode: 0 };
  }
  return { stdout: warns.length ? JSON.stringify({ agent_message: warns.join('\n') }) : undefined, exitCode: 0 };
}

/**
 * Fallback for Cursor builds without preToolUse: afterFileEdit cannot block, so evaluate the pre-edit
 * guardrails anyway to make the violation visible (git pre-commit still blocks it).
 */
function cursorPostEditAudit(event: HookEvent, root: string, loaded: LoadedConfig | undefined): Decision[] {
  if (event.kind !== 'file.edit' || event.phase !== 'post') return [];
  return evaluate({ ...event, phase: 'pre' }, { root, loaded }).filter((d) => d.action === 'deny');
}

// ---------- entry point ----------

export type HookAgent = 'claude' | 'cursor';

export function runHook(agent: HookAgent, name: string | undefined, rawInput: string, env: NodeJS.ProcessEnv = process.env): HookOutput {
  let payload: Payload = {};
  try {
    payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  } catch {
    // malformed payload: never break the agent session (Cursor treats an empty permission answer as deny)
    return agent === 'cursor' ? cursorOutput(name ?? '', []) : { exitCode: 0 };
  }
  const payloadCwd: string | undefined = payload.cwd ?? payload.workspace_roots?.[0];
  const root = projectDir({ payloadCwd });
  const loaded = loadConfig(root);
  // Cursor also runs the Claude hooks of .claude/settings.json; when its own hooks are generated, skip the copy.
  if (agent === 'claude' && (env.CURSOR_VERSION || payload.cursor_version) && loaded?.config.agents?.includes('cursor')) return { exitCode: 0 };
  const event = agent === 'claude' ? claudeEvent(name, payload) : cursorEvent(name, payload);
  const eventName = agent === 'cursor' ? (name ?? payload.hook_event_name ?? '') : (name ?? '');
  if (!event) return agent === 'cursor' ? cursorOutput(eventName, []) : { exitCode: 0 };

  const decisions = evaluate(event, { root, loaded, env });
  for (const d of decisions) {
    if (d.action === 'deny' || d.action === 'warn') {
      recordEvent(root, { type: d.action === 'deny' ? 'guardrail.block' : 'guardrail.warn', agent, policy: d.policy, detail: d.message.split('\n')[0] });
    }
  }
  if (agent === 'cursor') {
    for (const d of cursorPostEditAudit(event, root, loaded)) {
      if (d.action !== 'deny') continue;
      recordEvent(root, { type: 'guardrail.warn', agent, policy: d.policy, detail: `post-edit (git pre-commit will block): ${d.message.split('\n')[0]}` });
      decisions.push({ action: 'warn', policy: d.policy, message: d.message });
    }
    return cursorOutput(eventName, decisions);
  }
  return claudeOutput(decisions);
}
