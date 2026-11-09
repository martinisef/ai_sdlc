// Exact command lines for each headless agent, and where the Cursor binary is found.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import type { LoadedConfig } from '@ai-native-sdlc/core';
import { AgentAccountError, agentBin, localAgent, runAgent, runAgentAsync, type AgentTask } from '../src/ci/agent.ts';

// Each stub records its argv as one JSON line; codex also writes --output-last-message.
const STUB = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') process.exit(0);
fs.appendFileSync(process.env.ARGS_LOG, JSON.stringify({ bin: require('node:path').basename(process.argv[1]), args }) + '\\n');
const last = args.indexOf('--output-last-message');
if (last >= 0) fs.writeFileSync(args[last + 1], 'final answer\\n');
console.log('stdout answer');
`;

function stubs(names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-agent-bin-'));
  for (const n of names) {
    writeFileSync(join(dir, n), STUB);
    chmodSync(join(dir, n), 0o755);
  }
  return dir;
}

const WORK = mkdtempSync(join(tmpdir(), 'sdlc-work-'));

function run(agent: 'claude' | 'codex' | 'cursor', mode: AgentTask['mode'], extra: NodeJS.ProcessEnv = {}, model?: string) {
  const log = join(mkdtempSync(join(tmpdir(), 'sdlc-agent-log-')), 'args.jsonl');
  const bin = stubs(['claude', 'codex', 'cursor-agent']);
  const env = { PATH: [bin, dirname(process.execPath)].join(delimiter), HOME: mkdtempSync(join(tmpdir(), 'sdlc-home-')), ARGS_LOG: log, ...extra };
  const out = runAgent(agent, { prompt: 'Review the diff', mode, cwd: WORK }, model, env);
  const [call] = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { out, call };
}

test('claude: read-only tool allowlist; edit mode accepts edits; model passed through', () => {
  const read = run('claude', 'read');
  assert.equal(read.call.bin, 'claude');
  assert.deepEqual(read.call.args, ['-p', 'Review the diff', '--allowedTools', 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*)']);
  assert.equal(read.out, 'stdout answer');
  const edit = run('claude', 'edit', {}, 'opus');
  assert.deepEqual(edit.call.args.slice(-4), ['--permission-mode', 'acceptEdits', '--model', 'opus']);
});

test('codex: read-only sandbox locally and in CI; edit is workspace-write locally, full access on CI runners', () => {
  const read = run('codex', 'read', { CI: 'true' });
  assert.deepEqual(read.call.args.slice(0, 3), ['exec', '--sandbox', 'read-only']);
  assert.equal(read.out, 'final answer', 'the answer comes from --output-last-message, not stdout');
  assert.equal(read.call.args.at(-1), 'Review the diff');
  assert.equal(run('codex', 'edit').call.args[2], 'workspace-write');
  const ci = run('codex', 'edit', { CI: 'true' }, 'gpt-x');
  assert.equal(ci.call.args[2], 'danger-full-access');
  assert.deepEqual(ci.call.args.slice(-3), ['-m', 'gpt-x', 'Review the diff']);
});

test('codex: OPENAI_API_KEY is passed as CODEX_API_KEY when that is not set', () => {
  const dir = stubs(['codex']);
  const log = join(mkdtempSync(join(tmpdir(), 'sdlc-agent-log-')), 'args.jsonl');
  const env = { PATH: [dir, dirname(process.execPath)].join(delimiter), ARGS_LOG: log, OPENAI_API_KEY: 'sk-test' };
  writeFileSync(join(dir, 'codex'), STUB.replace("fs.writeFileSync(args[last + 1], 'final answer\\n');", "fs.writeFileSync(args[last + 1], process.env.CODEX_API_KEY ?? 'none');"));
  chmodSync(join(dir, 'codex'), 0o755);
  assert.equal(runAgent('codex', { prompt: 'p', mode: 'read', cwd: WORK }, undefined, env), 'sk-test');
});

test('cursor: --trust and --workspace always; ask mode to read, --force to edit', () => {
  const read = run('cursor', 'read');
  assert.equal(read.call.bin, 'cursor-agent');
  assert.deepEqual(read.call.args, ['-p', '--output-format', 'text', '--trust', '--workspace', WORK, '--mode', 'ask', 'Review the diff']);
  const edit = run('cursor', 'edit', {}, 'sonnet');
  assert.deepEqual(edit.call.args.slice(6), ['--force', '--model', 'sonnet', 'Review the diff']);
});

test('agentBin: cursor-agent or agent on PATH, then ~/.local/bin, else the default name', () => {
  const node = dirname(process.execPath);
  const home = mkdtempSync(join(tmpdir(), 'sdlc-home-'));
  const empty = mkdtempSync(join(tmpdir(), 'sdlc-empty-'));
  assert.equal(agentBin('claude', { PATH: empty }), 'claude');
  assert.equal(agentBin('codex', { PATH: empty }), 'codex');
  assert.equal(agentBin('cursor', { PATH: [stubs(['agent']), node].join(delimiter), HOME: home }), 'agent');
  assert.equal(agentBin('cursor', { PATH: [stubs(['agent', 'cursor-agent']), node].join(delimiter), HOME: home }), 'cursor-agent', 'the older name first');
  assert.equal(agentBin('cursor', { PATH: [empty, node].join(delimiter), HOME: home }), 'cursor-agent', 'not installed: the default, so the error names it');
  mkdirSync(join(home, '.local/bin'), { recursive: true });
  writeFileSync(join(home, '.local/bin/agent'), STUB);
  chmodSync(join(home, '.local/bin/agent'), 0o755);
  assert.equal(agentBin('cursor', { PATH: [empty, node].join(delimiter), HOME: home }), join(home, '.local/bin/agent'), 'installed but not on PATH yet');
});

test('localAgent: ci.agent or SDLC_CI_AGENT, then the first configured agent that is installed, then any installed', () => {
  const node = dirname(process.execPath);
  const home = mkdtempSync(join(tmpdir(), 'sdlc-home-'));
  const cfg = (config: object) => ({ config: { version: 1, ...config }, path: '.sdlc/config.json', legacy: false, issues: [] }) as unknown as LoadedConfig;
  const env = (names: string[]) => ({ PATH: [stubs(names), node].join(delimiter), HOME: home });
  const both = env(['claude', 'cursor-agent']);
  assert.equal(localAgent(cfg({ agents: ['cursor', 'claude'] }), both), 'cursor');
  assert.equal(localAgent(cfg({ agents: ['claude', 'cursor'] }), both), 'claude');
  assert.equal(localAgent(cfg({ agents: ['claude', 'cursor'] }), env(['cursor-agent'])), 'cursor', 'claude is configured but not installed');
  assert.equal(localAgent(cfg({ agents: ['agents-md'] }), env(['codex'])), 'codex');
  assert.equal(localAgent(undefined, env(['codex'])), 'codex', 'no config: whatever is installed');
  assert.equal(localAgent(cfg({ agents: ['cursor'] }), env([])), 'claude', 'nothing installed: claude, so the error names it');
  assert.equal(localAgent(cfg({ agents: ['cursor'], ci: { agent: 'codex' } }), both), 'codex', 'ci.agent wins');
  assert.equal(localAgent(cfg({ agents: ['cursor'] }), { ...both, SDLC_CI_AGENT: 'claude' }), 'claude', 'SDLC_CI_AGENT wins');
});

test('a missing agent CLI says how to install it', () => {
  const empty = mkdtempSync(join(tmpdir(), 'sdlc-empty-'));
  assert.throws(() => runAgent('claude', { prompt: 'p', mode: 'read', cwd: WORK }, undefined, { PATH: empty }), /claude: not installed \(run: sdlc ci bootstrap\)/);
});

test('a refused account (quota, bad key) is its own error, with the key masked; other failures keep the exit code', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-agent-bin-'));
  writeFileSync(join(dir, 'codex'), `#!/bin/sh\necho "$STUB_ERR" >&2\nexit \${STUB_CODE:-1}\n`);
  chmodSync(join(dir, 'codex'), 0o755);
  const env = (err: string, code = '1') => ({ PATH: [dir, dirname(process.execPath), '/bin', '/usr/bin'].join(delimiter), STUB_ERR: err, STUB_CODE: code });
  const task = { prompt: 'p', mode: 'read' as const, cwd: WORK };
  assert.throws(() => runAgent('codex', task, undefined, env('ERROR: Quota exceeded. Check your plan and billing details.')), (e: Error) => e instanceof AgentAccountError && /refused the account \(ERROR: Quota exceeded/.test(e.message));
  assert.throws(() => runAgent('codex', task, undefined, env('Incorrect API key provided: sk-proj-abc123XYZ.')), (e: Error) => e instanceof AgentAccountError && !e.message.includes('abc123') && /\*\*\*/.test(e.message));
  await assert.rejects(runAgentAsync('codex', { ...task, log: () => {} }, undefined, env('Your credit balance is too low to access the API')), AgentAccountError);
  assert.throws(() => runAgent('codex', task, undefined, env('panic: something else', '2')), (e: Error) => !(e instanceof AgentAccountError) && /codex exited with 2/.test(e.message));
});
