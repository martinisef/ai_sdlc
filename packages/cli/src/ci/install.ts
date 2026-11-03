// `sdlc ci install`: copies the CI templates for the provider, with the stack setup and the project's
// commands filled in. Never overwrites: an existing file is reported as a conflict, like `sdlc sync`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { localeDir } from '@ai-native-sdlc/adapters';
import type { Config, Locale, Provider } from '@ai-native-sdlc/core';

const TARGETS: Record<Provider, Record<string, string>> = {
  github: {
    'ci.yml': '.github/workflows/ci.yml',
    'sdlc-review.yml': '.github/workflows/sdlc-review.yml',
    'sdlc-security.yml': '.github/workflows/sdlc-security.yml',
    'sdlc-loop.yml': '.github/workflows/sdlc-loop.yml',
    'sdlc-gates.yml': '.github/workflows/sdlc-gates.yml',
    'sdlc-evals.yml': '.github/workflows/sdlc-evals.yml',
    'sdlc-bands.yml': '.github/workflows/sdlc-bands.yml',
  },
  gitlab: { 'gitlab-ci.yml': '.gitlab-ci.yml', 'sdlc.gitlab-ci.yml': 'ci/sdlc.gitlab-ci.yml' },
  bitbucket: { 'bitbucket-pipelines.yml': 'bitbucket-pipelines.yml' },
};

export interface InstallReport {
  written: string[];
  conflicts: string[];
}

interface StackCi {
  githubSetup?: string;
  image?: string;
}

/** Reads the "CI" section of stacks/<lang>.md: the GitHub setup steps and the GitLab/Bitbucket image. */
export function stackCi(locale: Locale, language: string | undefined): StackCi {
  if (!language) return {};
  const file = join(localeDir(locale), 'skills', 'sdlc-setup', 'stacks', `${language}.md`);
  if (!existsSync(file)) return {};
  const md = readFileSync(file, 'utf8');
  const section = md.slice(md.search(/^## CI\b/m));
  const gh = /\*\*GitHub\*\*[^\n]*\n\s*```ya?ml\n([\s\S]*?)```/.exec(section)?.[1];
  const image = /\*\*GitLab\*\*:\s*`image:\s*([^`]+)`/.exec(section)?.[1]?.trim();
  return {
    githubSetup: gh
      ?.split('\n')
      .map((l) => l.replace(/^ {2}/, ''))
      .join('\n')
      .trim(),
    image,
  };
}

/** Replaces each `# >>> stack … # <<< stack` block with the stack's setup, keeping the indentation. */
export function fillStack(yaml: string, ci: StackCi, provider: Provider): string {
  return yaml.replace(/^( *)# >>> stack[^\n]*\n([\s\S]*?)^ *# <<< stack[^\n]*\n/gm, (block, indent: string, body: string) => {
    if (provider === 'github') {
      if (!ci.githubSetup) return block;
      return ci.githubSetup.split('\n').map((l) => `${indent}${l}`).join('\n') + '\n';
    }
    if (!ci.image || !/^\s*image:/m.test(body)) return block;
    return body.replace(/^(\s*)image:.*$/m, `$1image: ${ci.image}`);
  });
}

/** Without a Makefile, the build step runs the project's own commands. */
export function fillCommands(yaml: string, config: Config, hasMakefile: boolean): string {
  if (hasMakefile) return yaml;
  const c = config.commands ?? {};
  const map: Record<string, string | undefined> = { 'make build': c.build, 'make lint': c.lint, 'make test': c.test };
  return yaml.replace(/make (build|lint|test)\b/g, (m) => map[m] || m);
}

export function installCi(root: string, config: Config, opts: { provider: Provider; locale: Locale; files?: string[] }): InstallReport {
  const src = join(localeDir(opts.locale), 'skills', 'sdlc-setup', 'ci', opts.provider);
  const targets = TARGETS[opts.provider];
  const wanted = opts.provider === 'github' && opts.files ? opts.files : Object.keys(targets);
  const ci = stackCi(opts.locale, config.stack?.language);
  const branch = config.vcs?.default_branch ?? 'main';
  const hasMakefile = existsSync(join(root, 'Makefile'));
  const report: InstallReport = { written: [], conflicts: [] };
  for (const name of wanted) {
    const target = targets[name];
    if (!target || !existsSync(join(src, name))) continue;
    if (existsSync(join(root, target))) {
      report.conflicts.push(target);
      continue;
    }
    let yaml = readFileSync(join(src, name), 'utf8');
    yaml = fillStack(yaml, ci, opts.provider);
    yaml = fillCommands(yaml, config, hasMakefile);
    if (branch !== 'main') yaml = yaml.replace(/branches: \[main\]/g, `branches: [${branch}]`).replace(/^( {4})main:$/m, `$1${branch}:`);
    mkdirSync(dirname(join(root, target)), { recursive: true });
    writeFileSync(join(root, target), yaml);
    report.written.push(target);
  }
  return report;
}

/** Secrets the installed workflows read, for the summary. */
export function ciSecrets(config: Config): string[] {
  const agent = config.ci?.agent ?? 'claude';
  return [agent === 'codex' ? 'OPENAI_API_KEY' : agent === 'cursor' ? 'CURSOR_API_KEY' : 'ANTHROPIC_API_KEY'];
}
