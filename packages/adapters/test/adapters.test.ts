import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { claudePluginHooks, contentDir, detectDrift, doctor, loadSkills, preCommit, prePush, runHook, sync } from '@ai-native-sdlc/adapters';
import { loadConfig, parseFrontmatter, readEvents } from '@ai-native-sdlc/core';
import { gitIn, repo } from '../../core/test/helpers.ts';

const CONFIG = {
  version: 1,
  locale: 'en',
  agents: ['claude', 'cursor', 'agents-md'],
  protected_paths: ['migrations/**'],
  test_globs: ['tests/**'],
  production_gate: { patterns: ['deploy.*prod'] },
};

test('cursor: beforeShellExecution denies with a permission JSON and logs the block', () => {
  const root = repo(CONFIG);
  const out = runHook('cursor', undefined, JSON.stringify({ hook_event_name: 'beforeShellExecution', command: './deploy.sh prod', workspace_roots: [root] }), {});
  assert.equal(out.exitCode, 0);
  const body = JSON.parse(out.stdout!);
  assert.equal(body.permission, 'deny');
  assert.match(body.agent_message, /production gate/);
  assert.equal(readEvents(root)[0].policy, 'production-gate');
  const ok = JSON.parse(runHook('cursor', 'beforeShellExecution', JSON.stringify({ command: 'npm test', workspace_roots: [root] }), {}).stdout!);
  assert.equal(ok.permission, 'allow');
});

test('cursor: preToolUse blocks Write/Delete on protected paths, test-lock and secrets before they happen', () => {
  const root = repo(CONFIG);
  const pre = (tool_name: string, tool_input: object) =>
    JSON.parse(runHook('cursor', 'preToolUse', JSON.stringify({ hook_event_name: 'preToolUse', tool_name, tool_input, cwd: null, workspace_roots: [root] }), {}).stdout!);
  const migration = join(root, 'migrations/001.sql');
  assert.equal(pre('Write', { file_path: migration, content: 'x' }).permission, 'deny');
  assert.equal(pre('Delete', { file_path: migration }).permission, 'deny');
  assert.match(pre('Write', { file_path: join(root, 'app.py'), content: 'k = "AKIAABCDEFGHIJKLMNOP"\n' }).agent_message, /credential/);
  assert.equal(pre('Write', { file_path: join(root, 'app.py'), content: 'print(1)\n' }).permission, 'allow');
  assert.equal(pre('Read', { file_path: migration }).permission, 'allow');
  assert.equal(JSON.parse(runHook('cursor', 'preToolUse', '{"broken', {}).stdout!).permission, 'allow');
  writeFileSync(join(root, '.sdlc/fix-lock'), '');
  assert.equal(pre('Write', { file_path: join(root, 'tests/test_app.py'), content: 'x' }).permission, 'deny');
  assert.deepEqual(readEvents(root).map((e) => e.policy), ['test-lock', 'secrets', 'protected-paths', 'protected-paths']);
});

test('claude hooks imported by Cursor are skipped when the Cursor adapter is enabled', () => {
  const root = repo(CONFIG);
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(root, 'migrations/001.sql'), content: 'x' }, cwd: root });
  assert.equal(runHook('claude', 'pre-tool', payload, { CURSOR_VERSION: '3.1.0' }).exitCode, 0);
  assert.equal(runHook('claude', 'pre-tool', payload, {}).exitCode, 2);
});

test('cursor: afterFileEdit cannot block but reports a protected path', () => {
  const root = repo(CONFIG);
  const out = runHook('cursor', 'afterFileEdit', JSON.stringify({ file_path: join(root, 'migrations/001.sql'), edits: [], workspace_roots: [root] }), {});
  assert.equal(out.exitCode, 0);
  assert.match(JSON.parse(out.stdout!).agent_message, /protected path/);
});

test('cursor: stop sends a follow-up once (loop_count guards against loops)', () => {
  const root = repo(CONFIG);
  gitIn(root, 'checkout', '-qb', 'change/x');
  mkdirSync(join(root, 'changes/x'), { recursive: true });
  writeFileSync(join(root, 'changes/x/plan.md'), '---\nstatus: approved\n---\n');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'plan');
  writeFileSync(join(root, 'app.py'), 'x');
  const first = JSON.parse(runHook('cursor', 'stop', JSON.stringify({ loop_count: 0, workspace_roots: [root] }), {}).stdout!);
  assert.match(first.followup_message, /plan\.md/);
  assert.deepEqual(JSON.parse(runHook('cursor', 'stop', JSON.stringify({ loop_count: 1, workspace_roots: [root] }), {}).stdout!), {});
});

test('git pre-commit blocks staged protected paths and secrets; override is recorded', () => {
  const root = repo(CONFIG);
  mkdirSync(join(root, 'migrations'));
  writeFileSync(join(root, 'migrations/001.sql'), 'create table x;');
  gitIn(root, 'add', '-A');
  const out = preCommit(root, {});
  assert.equal(out.exitCode, 1);
  assert.match(out.stderr!, /protected path[\s\S]*SDLC_OVERRIDE=protected-paths/);
  assert.equal(preCommit(root, { SDLC_OVERRIDE: 'protected-paths' }).exitCode, 0);
  assert.equal(readEvents(root)[0].type, 'guardrail.override');

  gitIn(root, 'reset', '-q');
  writeFileSync(join(root, 'app.py'), 'k = "AKIAABCDEFGHIJKLMNOP"\n');
  gitIn(root, 'add', 'app.py');
  assert.match(preCommit(root, {}).stderr!, /credential/);
});

test('git pre-push: code on a change branch needs an approved plan', () => {
  const root = repo(CONFIG);
  gitIn(root, 'checkout', '-qb', 'change/x');
  mkdirSync(join(root, 'changes/x'), { recursive: true });
  writeFileSync(join(root, 'changes/x/intent.md'), '---\nstatus: accepted\n---\n');
  writeFileSync(join(root, 'app.py'), 'x');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'wip');
  assert.match(prePush(root, {}).stderr!, /plan\.md is not approved/);
  writeFileSync(join(root, 'changes/x/plan.md'), '---\nstatus: approved\n---\n');
  assert.equal(prePush(root, {}).exitCode, 0);
});

test('sync renders every agent, merges foreign hooks, and detects drift', () => {
  const root = repo(CONFIG);
  mkdirSync(join(root, '.cursor'));
  writeFileSync(join(root, '.cursor/hooks.json'), JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: './mine.sh' }] } }));
  writeFileSync(join(root, 'AGENTS.md'), '# Team notes\n\nKeep this.\n');
  const loaded = loadConfig(root)!;
  const r = sync(root, loaded);
  assert.deepEqual(r.drift, []);
  for (const p of ['.sdlc/bin/sdlc', '.sdlc/git-hooks/pre-commit', '.agents/skills/sdlc-spec/SKILL.md', '.cursor/agents/verifier.md', '.cursor/rules/ai-sdlc.mdc', '.claude/skills/sdlc-build/SKILL.md', '.claude/agents/verifier.md']) {
    assert.ok(existsSync(join(root, p)), p);
  }
  const cursorHooks = JSON.parse(readFileSync(join(root, '.cursor/hooks.json'), 'utf8')).hooks;
  assert.deepEqual(cursorHooks.afterFileEdit.map((h: { command: string }) => h.command), ['./mine.sh', '.sdlc/bin/sdlc hook afterFileEdit --agent cursor']);
  assert.deepEqual(cursorHooks.preToolUse, [{ command: '.sdlc/bin/sdlc hook preToolUse --agent cursor', matcher: 'Write|Delete' }]);
  assert.match(readFileSync(join(root, '.cursor/agents/spec-reviewer.md'), 'utf8'), /^---\nname: spec-reviewer\ndescription: ".+"\nreadonly: true\n---\n/);
  const agentsMd = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(agentsMd, /Keep this\.[\s\S]*ai-sdlc:start[\s\S]*sdlc-intent/);
  assert.doesNotMatch(readFileSync(join(root, '.agents/skills/sdlc-build/SKILL.md'), 'utf8'), /\{\{sdlc_hint\}\}/);
  assert.equal(gitIn(root, 'config', 'core.hooksPath'), '.sdlc/git-hooks');
  const claudeSettings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  assert.match(claudeSettings.hooks.PreToolUse[0].hooks[0].command, /\.sdlc\/bin\/sdlc hook pre-tool --agent claude/);

  // idempotent: a second sync writes nothing and AGENTS.md keeps a single block
  const again = sync(root, loaded);
  assert.deepEqual(again.written, []);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8').match(/ai-sdlc:start/g)?.length, 1);

  writeFileSync(join(root, '.cursor/rules/ai-sdlc.mdc'), 'edited by hand');
  assert.deepEqual(detectDrift(root), ['.cursor/rules/ai-sdlc.mdc']);
  assert.deepEqual(sync(root, loaded).drift, ['.cursor/rules/ai-sdlc.mdc']);
  assert.equal(readFileSync(join(root, '.cursor/rules/ai-sdlc.mdc'), 'utf8'), 'edited by hand');
  sync(root, loaded, { force: true });
  assert.deepEqual(detectDrift(root), []);

  // disabling an agent removes its untouched generated files and keeps hand-edited ones
  writeFileSync(join(root, '.cursor/agents/researcher.md'), 'mine now');
  const fewer = sync(root, { ...loaded, config: { ...loaded.config, agents: ['claude'] } });
  assert.ok(fewer.removed.includes('.cursor/rules/ai-sdlc.mdc'));
  assert.ok(!existsSync(join(root, '.cursor/agents/verifier.md')));
  assert.ok(!existsSync(join(root, '.cursor/rules')), 'emptied directories are removed');
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.cursor/hooks.json'), 'utf8')).hooks, { afterFileEdit: [{ command: './mine.sh' }] });
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), '# Team notes\n\nKeep this.\n');
  assert.deepEqual(fewer.drift, ['.cursor/agents/researcher.md']);
  assert.equal(readFileSync(join(root, '.cursor/agents/researcher.md'), 'utf8'), 'mine now');
});

test('generated git hook runs the CLI end to end through the shim', () => {
  const root = repo(CONFIG);
  sync(root, loadConfig(root)!);
  mkdirSync(join(root, 'migrations'));
  writeFileSync(join(root, 'migrations/001.sql'), 'x');
  gitIn(root, 'add', '-A');
  const cli = `node --conditions=source ${join(import.meta.dirname, '../../cli/src/main.ts')}`;
  assert.throws(
    () => execFileSync('git', ['commit', '-qm', 'try'], { cwd: root, env: { ...process.env, SDLC_BIN: cli }, stdio: 'pipe' }),
    (e: { stderr: Buffer }) => /protected path/.test(e.stderr.toString()),
  );
});

test('content locales stay in sync: same files, frontmatter keys, placeholders and modes', () => {
  const files = (dir: string, base = dir): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name), base) : [relative(base, join(dir, e.name))]));
  const en = join(contentDir(), 'en');
  const es = join(contentDir(), 'es');
  assert.deepEqual(files(en).sort(), files(es).sort());
  const placeholders = (s: string) => (s.match(/\{\{\w+\}\}|\$ARGUMENTS/g) ?? []).sort();
  for (const rel of files(es)) {
    const a = readFileSync(join(en, rel), 'utf8');
    const b = readFileSync(join(es, rel), 'utf8');
    assert.deepEqual(Object.keys(parseFrontmatter(a).data), Object.keys(parseFrontmatter(b).data), `${rel}: frontmatter keys`);
    assert.deepEqual(placeholders(a), placeholders(b), `${rel}: placeholders`);
    assert.equal(statSync(join(en, rel)).mode & 0o111, statSync(join(es, rel)).mode & 0o111, `${rel}: executable bit`);
    if (rel.endsWith('.json')) assert.doesNotThrow(() => JSON.parse(a), `${rel}: valid JSON`);
  }
  for (const s of loadSkills('en')) assert.equal(parseFrontmatter(s.files.find((f) => f.rel === 'SKILL.md')!.content).data.name, s.name);
});

test('plugin hooks call the bundled CLI', () => {
  assert.match(claudePluginHooks().hooks.PreToolUse[0].hooks[0].command, /bin\/sdlc\.mjs" hook pre-tool --agent claude$/);
});

test('doctor reports missing setup and the enforcement matrix', () => {
  const root = repo(CONFIG);
  const before = doctor(root);
  assert.ok(before.checks.some((c) => c.id === 'git-hooks' && !c.ok));
  sync(root, loadConfig(root)!);
  const after = doctor(root);
  assert.ok(after.checks.find((c) => c.id === 'git-hooks')!.ok);
  assert.deepEqual(after.agents, ['claude', 'cursor', 'agents-md']);
  assert.deepEqual(after.matrix.find((m) => m.guardrail === 'protected-paths')!['agents-md'], ['commit']);
});
