import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fillCommands, fillStack, installCi, stackCi } from '../src/ci/install.ts';
import { detectConfig, ignoreNodeModules, presetConfig } from '../src/init.ts';
import { parsePeople } from '../src/presets.ts';
import { sdlc } from './helpers.ts';

function bare(remote = 'git@github.com:acme/shop.git'): string {
  const root = join(mkdtempSync(join(tmpdir(), 'sdlc-init-')), 'proj');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'pyproject.toml'), '[project]\nname = "shop"\n');
  const g = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('remote', 'add', 'origin', remote);
  g('add', '-A');
  g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  return root;
}

test('presets: solo allows self-approval, team assigns roles, regulated adds high-risk paths', () => {
  const base = detectConfig(bare(), 'en');
  const solo = presetConfig(base, 'solo');
  assert.deepEqual(solo.gates, {});
  assert.equal(solo.gates_self_approval, true);
  const team = presetConfig(base, 'team-github', { po: 'ana, bo@acme.io', techLead: '@carla' });
  assert.deepEqual(team.roles, { po: ['@ana', 'bo@acme.io'], 'tech-lead': ['@carla'] });
  assert.deepEqual(team.gates?.plan, ['tech-lead']);
  const reg = presetConfig(base, 'regulated');
  assert.ok(reg.risk?.high_risk_paths?.includes('infra/**'));
  assert.deepEqual(reg.gates?.spec, ['po', 'tech-lead']);
  assert.equal(base.gates_self_approval, undefined, 'presets do not mutate the detected config');
});

test('parsePeople: logins get @, emails and names stay', () => {
  assert.deepEqual(parsePeople(' ana , x@y.z, Bo Li ,'), ['@ana', 'x@y.z', 'Bo Li']);
});

test('ci install: stack setup and commands are filled in, existing files are kept', () => {
  const ci = stackCi('en', 'python');
  assert.match(ci.githubSetup ?? '', /setup-uv/);
  assert.match(ci.image ?? '', /uv:python/);
  const yaml = '    steps:\n      # >>> stack: x\n      # <<< stack\n      - run: make test\n';
  const filled = fillStack(yaml, ci, 'github');
  assert.match(filled, /^ {6}- uses: astral-sh\/setup-uv@v5$/m);
  assert.doesNotMatch(filled, />>> stack/);
  assert.equal(fillCommands('make build && make test', { version: 1, commands: { build: 'uv build', test: 'uv run pytest' } }, false), 'uv build && uv run pytest');

  const root = bare();
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(join(root, '.github/workflows/ci.yml'), 'mine\n');
  const r = installCi(root, detectConfig(root, 'en'), { provider: 'github', locale: 'en', files: ['ci.yml', 'sdlc-review.yml'] });
  assert.deepEqual(r.conflicts, ['.github/workflows/ci.yml']);
  assert.deepEqual(r.written, ['.github/workflows/sdlc-review.yml']);
  assert.equal(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'), 'mine\n');

  const gl = installCi(bare('git@gitlab.com:acme/shop.git'), detectConfig(root, 'en'), { provider: 'gitlab', locale: 'en' });
  assert.deepEqual(gl.written, ['.gitlab-ci.yml', 'ci/sdlc.gitlab-ci.yml']);
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-stack-'));
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), body);
  }
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  return root;
}

test('stacks: Go, .NET and Rails are detected from minimal fixtures and combine with every preset', () => {
  const cases: { files: Record<string, string>; language?: string; test: string; protect?: string; append?: string }[] = [
    { files: { 'go.mod': 'module x\n' }, language: 'go', test: 'go test ./...', protect: '**/*.pb.go', append: undefined },
    { files: { 'Shop.sln': '', 'src/Shop/Shop.csproj': '<Project />', 'package.json': '{}' }, language: 'dotnet', test: 'dotnet test', protect: '**/*.g.cs', append: '**/Migrations/*.Designer.cs' },
    { files: { 'src/Api.csproj': '<Project />' }, language: undefined, test: 'make test', protect: undefined, append: undefined },
    { files: { Gemfile: '', 'config/application.rb': '', 'package.json': '{}' }, language: 'ruby', test: 'bin/rails test', protect: 'db/schema.rb', append: 'db/migrate/**' },
    { files: { Gemfile: '', 'config/application.rb': '', '.rspec': '' }, language: 'ruby', test: 'bundle exec rspec', protect: 'db/schema.rb', append: 'db/migrate/**' },
    { files: { Gemfile: '' }, language: undefined, test: 'make test', protect: undefined, append: undefined },
  ];
  for (const c of cases) {
    const config = detectConfig(fixture(c.files), 'en');
    const what = Object.keys(c.files).join(' + ');
    assert.equal(config.stack?.language, c.language, what);
    assert.equal(config.commands?.test, c.test, what);
    assert.equal(config.protected_paths?.[0], c.protect, what);
    assert.equal(config.append_only_paths?.[0], c.append, what);
    for (const preset of ['solo', 'team-github', 'regulated'] as const) {
      const p = presetConfig(config, preset, { po: 'ana' });
      assert.deepEqual([p.stack, p.commands, p.test_globs, p.append_only_paths], [config.stack, config.commands, config.test_globs, config.append_only_paths], `${what} · ${preset}`);
    }
  }
  for (const locale of ['en', 'es'] as const) {
    for (const [language, setup, image] of [['go', /setup-go/, /^golang:/], ['dotnet', /setup-dotnet/, /dotnet\/sdk/], ['ruby', /setup-ruby/, /^ruby:/]] as const) {
      const ci = stackCi(locale, language);
      assert.match(ci.githubSetup ?? '', setup, `${locale}/${language}`);
      assert.match(ci.image ?? '', image, `${locale}/${language}`);
    }
  }
});

test('sdlc init --preset --first-change: one step to a configured repo with CI and an intent', async () => {
  const root = bare();
  const r = await sdlc(root, ['init', '--preset', 'team-github', '--yes', '--first-change', 'Add a health endpoint']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /✓ ai-sdlc ready · preset team-github · python/);
  assert.match(r.out, /CI {7}\d file\(s\) for github; secret ANTHROPIC_API_KEY/);
  assert.ok(existsSync(join(root, '.github/workflows/sdlc-review.yml')));
  assert.ok(!existsSync(join(root, '.github/workflows/sdlc-bands.yml')), 'bands only in the regulated preset');
  assert.doesNotMatch(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'), /make build/, 'no Makefile: the stack commands are used');
  const intent = readdirSync(join(root, 'changes')).find((d) => d.endsWith('add-a-health-endpoint'));
  assert.ok(intent, 'first change created');
  assert.match(readFileSync(join(root, 'changes', intent, 'intent.md'), 'utf8'), /Add a health endpoint/);
  assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(), 'change/add-a-health-endpoint');
});

test('sdlc init without a remote skips CI and says how to add it', async () => {
  const root = bare();
  execFileSync('git', ['remote', 'remove', 'origin'], { cwd: root });
  const r = await sdlc(root, ['init', '--yes']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /preset solo/);
  assert.match(r.out, /no remote detected/);
  assert.ok(!existsSync(join(root, '.github')));
});

test('sdlc init keeps node_modules/ out of the first commit', async () => {
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  const root = bare();
  const r = await sdlc(root, ['init', '--yes']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /added node_modules\/ to \.gitignore/);
  assert.equal(readFileSync(join(root, '.gitignore'), 'utf8'), 'node_modules/\n');
  assert.equal(ignoreNodeModules(root), false, 'only once');

  const other = bare();
  writeFileSync(join(other, '.gitignore'), 'dist');
  assert.equal(ignoreNodeModules(other), true);
  assert.equal(readFileSync(join(other, '.gitignore'), 'utf8'), 'dist\nnode_modules/\n');
  writeFileSync(join(other, '.gitignore'), '/node_modules\n');
  assert.equal(ignoreNodeModules(other), false, 'any spelling git honours');
});
