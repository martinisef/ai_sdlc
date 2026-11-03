// `sdlc init`: the deterministic half of setup (detect → config → scaffold → sync).
// Judgment calls (CLAUDE.md content, REVIEW.md, CI wiring) stay in the /sdlc-setup skill.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { localeDir } from '@ai-native-sdlc/adapters';
import { AGENTS, git, type AgentId, type Config, type Locale } from '@ai-native-sdlc/core';
import { defaultPreset, isPreset, parsePeople, PRESET_SPECS, PRESETS, type Preset } from './presets.ts';

interface StackDefaults {
  language: string;
  package_manager: string;
  commands: Config['commands'];
  format_on_edit: Record<string, string>;
  test_globs: string[];
  protected_paths: string[];
  append_only_paths?: string[];
}

const STACKS: Record<string, StackDefaults> = {
  python: {
    language: 'python',
    package_manager: 'uv',
    commands: { build: 'uv build', test: 'uv run pytest', lint: 'uv run ruff check .', format: 'uv run ruff format .' },
    format_on_edit: { '*.py': 'uv run ruff format {file}' },
    test_globs: ['tests/**', '**/test_*.py', '**/*_test.py', '**/conftest.py'],
    protected_paths: ['migrations/versions/**', '**/*_pb2.py', '**/_generated/**'],
  },
  typescript: {
    language: 'typescript',
    package_manager: 'npm',
    commands: { build: 'npm run build', test: 'npm test', lint: 'npm run lint', format: 'npm run format' },
    format_on_edit: {},
    test_globs: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.test.js', '**/*.test.mjs', '**/*.spec.js', '**/__tests__/**', 'e2e/**', 'tests/**', 'test/**'],
    protected_paths: ['prisma/migrations/**', 'drizzle/**', 'src/gen/**', '**/*.generated.ts'],
  },
  java: {
    language: 'java',
    package_manager: 'gradle',
    commands: { build: './gradlew build -x test', test: './gradlew test', lint: './gradlew check -x test', format: './gradlew spotlessApply' },
    format_on_edit: {},
    test_globs: ['src/test/**', 'src/integrationTest/**', 'src/itest/**'],
    protected_paths: ['src/main/resources/db/migration/**', 'build/generated/**', '**/generated/**'],
  },
  go: {
    language: 'go',
    package_manager: 'go',
    commands: { build: 'go build ./...', test: 'go test ./...', lint: 'go vet ./...', format: 'gofmt -w .' },
    format_on_edit: { '*.go': 'gofmt -w {file}' },
    test_globs: ['**/*_test.go', 'testdata/**'],
    protected_paths: ['**/*.pb.go', '**/zz_generated*.go'],
  },
  dotnet: {
    language: 'dotnet',
    package_manager: 'dotnet',
    commands: { build: 'dotnet build', test: 'dotnet test', lint: 'dotnet format --verify-no-changes', format: 'dotnet format' },
    format_on_edit: {},
    test_globs: ['tests/**', 'test/**', '**/*.Tests/**', '**/*.Test/**', '**/*Tests.cs'],
    protected_paths: ['**/*.g.cs'],
    append_only_paths: ['**/Migrations/*.Designer.cs', '**/Migrations/2*.cs'],
  },
  ruby: {
    language: 'ruby',
    package_manager: 'bundler',
    commands: { build: 'bin/rails zeitwerk:check', test: 'bin/rails test', lint: 'bundle exec rubocop', format: 'bundle exec rubocop -a' },
    format_on_edit: { '*.rb': 'bundle exec rubocop -a {file}' },
    test_globs: ['test/**', 'spec/**'],
    protected_paths: ['db/schema.rb', 'db/structure.sql'],
    append_only_paths: ['db/migrate/**'],
  },
};

export function detectStack(root: string): string | undefined {
  const has = (f: string) => existsSync(join(root, f));
  // before package.json: Rails and ASP.NET apps often carry a JS frontend too
  if (has('Gemfile') && has('config/application.rb')) return 'ruby';
  if (readdirSync(root).some((f) => f.endsWith('.sln') || f.endsWith('.csproj'))) return 'dotnet';
  if (has('pyproject.toml') || has('requirements.txt')) return 'python';
  if (has('package.json') || has('tsconfig.json')) return 'typescript';
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) return 'java';
  if (has('go.mod')) return 'go';
  return undefined;
}

function detectPackageManager(root: string, stack: string, fallback: string): string {
  if (stack !== 'typescript') return stack === 'java' && existsSync(join(root, 'pom.xml')) ? 'maven' : fallback;
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function detectAgents(root: string): AgentId[] {
  const found: AgentId[] = [];
  if (existsSync(join(root, '.claude')) || existsSync(join(root, 'CLAUDE.md'))) found.push('claude');
  if (existsSync(join(root, '.cursor')) || existsSync(join(root, '.cursorrules'))) found.push('cursor');
  if (existsSync(join(root, 'AGENTS.md')) || existsSync(join(root, '.codex'))) found.push('agents-md');
  return found.length ? found : ['claude'];
}

export function detectConfig(root: string, locale: Locale): Config {
  const stackId = detectStack(root);
  const stack = stackId ? STACKS[stackId] : undefined;
  const remote = git(root, ['remote', 'get-url', 'origin']) ?? '';
  const provider = remote.includes('github') ? 'github' : remote.includes('gitlab') ? 'gitlab' : remote.includes('bitbucket') ? 'bitbucket' : undefined;
  const head = git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])?.replace(/^origin\//, '');
  const config: Config = {
    version: 1,
    locale,
    agents: detectAgents(root),
    vcs: { ...(provider ? { provider } : {}), default_branch: head ?? git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])?.replace(/^HEAD$/, 'main') ?? 'main' },
    tracker: { provider: 'none' },
  };
  if (stack) {
    const pm = detectPackageManager(root, stackId!, stack.package_manager);
    const swap = (s: string) => (stack.language === 'typescript' ? s.replace(/^npm /, `${pm} `) : s);
    config.stack = { language: stack.language, package_manager: pm };
    config.commands = Object.fromEntries(Object.entries(stack.commands ?? {}).map(([k, v]) => [k, swap(v as string)]));
    config.format_on_edit = stack.format_on_edit;
    config.test_globs = stack.test_globs;
    config.protected_paths = stack.protected_paths;
    if (stack.append_only_paths) config.append_only_paths = stack.append_only_paths;
    if (stackId === 'ruby' && (existsSync(join(root, '.rspec')) || existsSync(join(root, 'spec')))) config.commands.test = 'bundle exec rspec';
  } else {
    config.commands = { build: 'make build', test: 'make test', lint: 'make lint', format: 'make format' };
    config.test_globs = ['tests/**', 'test/**'];
    config.protected_paths = [];
  }
  config.secret_patterns_extra = [];
  config.risk = { high_risk_paths: [] };
  config.production_gate = { patterns: ['deploy.*prod', 'terraform apply', 'kubectl .*--context[= ].*prod'], approval_env: 'RELEASE_APPROVAL' };
  config.gates = { intent: ['po'], spec: ['po'], plan: ['tech-lead'] };
  config.roles = {};
  return config;
}

export interface InitAnswers {
  preset: Preset;
  config: Config;
}

/** Applies a preset and the people to the detected config. Roles stay empty (= any person) when none are given. */
export function presetConfig(config: Config, preset: Preset, people: { po?: string; techLead?: string } = {}): Config {
  const out = PRESET_SPECS[preset].apply(structuredClone(config));
  if (PRESET_SPECS[preset].roles) {
    const po = parsePeople(people.po ?? '');
    const tl = parsePeople(people.techLead ?? '');
    out.roles = { ...(po.length ? { po } : {}), ...(tl.length ? { 'tech-lead': tl } : {}) };
  }
  return out;
}

/** Three questions: preset, PO, tech lead. Everything else is detected and editable later (`sdlc ui` → Settings). */
export async function askConfig(config: Config, preset?: Preset): Promise<InitAnswers> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ask = async (q: string, def: string) => (await rl.question(`${q} [${def}]: `)).trim() || def;
    let chosen = preset;
    while (!chosen) {
      for (const p of PRESETS) console.log(`  ${p.padEnd(12)} ${PRESET_SPECS[p].description}`);
      const a = await ask('Preset', defaultPreset(config));
      if (isPreset(a)) chosen = a;
    }
    const agents = await ask(`Agents (${AGENTS.join(', ')})`, (config.agents ?? []).join(','));
    config.agents = agents.split(',').map((s) => s.trim()).filter((a): a is AgentId => (AGENTS as readonly string[]).includes(a));
    if (!PRESET_SPECS[chosen].roles) return { preset: chosen, config: presetConfig(config, chosen) };
    const hint = 'GitHub users and/or git emails, comma separated; empty = any person';
    const po = await ask(`Product Owner for intent/spec gates (${hint})`, '');
    const techLead = await ask(`Tech lead for plan gates (${hint})`, '');
    return { preset: chosen, config: presetConfig(config, chosen, { po, techLead }) };
  } finally {
    rl.close();
  }
}

/** Copy the fixed scaffold without overwriting anything. Returns the created paths. */
export function scaffold(root: string, opts: { claudeMd: boolean; locale: Locale }): string[] {
  const src = join(localeDir(opts.locale), 'skills', 'sdlc-setup', 'scaffold');
  const created: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const from = join(dir, name);
      const rel = relative(src, from);
      if (rel === 'CLAUDE.md' && !opts.claudeMd) continue;
      const to = join(root, rel);
      if (statSync(from).isDirectory()) {
        mkdirSync(to, { recursive: true });
        walk(from);
      } else if (!existsSync(to)) {
        copyFileSync(from, to);
        created.push(rel);
      }
    }
  };
  walk(src);
  return created;
}

export function templateFor(root: string, artifact: string, locale: Locale): string {
  const local = join(root, 'changes', '_templates', `${artifact}.md`);
  if (existsSync(local)) return readFileSync(local, 'utf8');
  return readFileSync(join(localeDir(locale), 'skills', 'sdlc-setup', 'scaffold', 'changes', '_templates', `${artifact}.md`), 'utf8');
}
