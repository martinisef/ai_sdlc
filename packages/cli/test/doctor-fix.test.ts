import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { project, sdlc } from './helpers.ts';

test('doctor --fix: sync, CI and commands are repaired; a second run has nothing left to fix', async () => {
  const root = project({ locale: 'en', agents: ['claude', 'agents-md'], vcs: { provider: 'github' }, commands: { build: 'uv build' } });
  writeFileSync(join(root, 'pyproject.toml'), '[project]\nname = "x"\n');

  const before = JSON.parse((await sdlc(root, ['doctor', '--json'])).out);
  const failing = before.checks.filter((c: { ok: boolean }) => !c.ok).map((c: { id: string }) => c.id);
  for (const id of ['git-hooks', 'shim', 'agents-md', 'ci', 'command.test', 'command.lint']) assert.ok(failing.includes(id), `${id} fails before`);

  const r = await sdlc(root, ['doctor', '--fix']);
  assert.match(r.out, /fixed\s+git-hooks\s+sdlc sync/);
  assert.match(r.out, /fixed\s+command\.test\s+commands\.test = uv run pytest/);
  assert.match(r.out, /fixed\s+ci\s+sdlc ci install: \.github\/workflows\/ci\.yml/);
  assert.ok(existsSync(join(root, 'AGENTS.md')));
  assert.equal(execFileSync('git', ['config', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).trim(), '.sdlc/git-hooks');

  const again = JSON.parse((await sdlc(root, ['doctor', '--fix', '--json'])).out);
  assert.deepEqual(
    again.filter((f: { fixed: boolean }) => f.fixed).map((f: { id: string }) => f.id),
    [],
    'idempotent',
  );
});

test('doctor --fix migrates a legacy config and reports what needs a person', async () => {
  const root = project({ locale: 'en' });
  execFileSync('git', ['mv', '.sdlc/config.json', 'legacy.json'], { cwd: root });
  mkdirSync(join(root, '.claude'), { recursive: true });
  execFileSync('git', ['mv', 'legacy.json', '.claude/sdlc.json'], { cwd: root });
  const r = await sdlc(root, ['doctor', '--fix']);
  assert.match(r.out, /fixed\s+config-legacy\s+moved \.claude\/sdlc\.json → \.sdlc\/config\.json/);
  assert.ok(existsSync(join(root, '.sdlc/config.json')));
  assert.match(r.out, /manual\s+vcs/);
});
