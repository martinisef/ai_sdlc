// Guardrails over agent-neutral events. Each agent adapter translates its hook payload into a HookEvent
// and the resulting Decision back into its own protocol.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { activeChange, isCodePath, listChanges } from './changes.ts';
import { localeOf, type LoadedConfig } from './config.ts';
import { currentBranch, git, lines } from './git.ts';
import { globMatch, matchAny } from './glob.ts';
import { t, type Locale } from './i18n.ts';
import { relPath } from './project.ts';

export type HookEvent =
  | { kind: 'file.edit'; phase: 'pre' | 'post'; path: string; content?: string }
  | { kind: 'file.read'; path: string; content?: string }
  | { kind: 'prompt'; text: string }
  | { kind: 'shell.exec'; command: string }
  | { kind: 'session.start' }
  | { kind: 'session.stop'; stopHookActive?: boolean };

export type PolicyId = 'protected-paths' | 'secrets' | 'test-lock' | 'production-gate' | 'format-on-edit' | 'plan-sync' | 'plan-first';

export type Decision =
  | { action: 'allow' }
  | { action: 'deny'; policy: PolicyId; message: string }
  | { action: 'warn'; policy: PolicyId; message: string }
  | { action: 'context'; message: string };

export interface PolicyContext {
  root: string;
  loaded: LoadedConfig | undefined;
  env?: NodeJS.ProcessEnv;
}

const ALLOW: Decision = { action: 'allow' };

export const BUILTIN_SECRET_PATTERNS = [
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----',
  'gh[pousr]_[A-Za-z0-9]{36}',
  'github_pat_[A-Za-z0-9_]{40,}',
  'glpat-[A-Za-z0-9_-]{20}',
  'xox[abprs]-[A-Za-z0-9-]{10,}',
  'sk-ant-[A-Za-z0-9_-]{20,}',
  'sk-[A-Za-z0-9]{40,}',
  'AIza[0-9A-Za-z_-]{35}',
  'ATATT3[A-Za-z0-9_=-]{20,}',
  `(api[_-]?key|secret|passw(or)?d|token)["']?[[:space:]]*[:=][[:space:]]*["'][A-Za-z0-9/+_=-]{16,}["']`,
];

const POSIX_CLASSES: Record<string, string> = {
  space: '\\s',
  alnum: 'A-Za-z0-9',
  alpha: 'A-Za-z',
  digit: '0-9',
  upper: 'A-Z',
  lower: 'a-z',
  xdigit: '0-9A-Fa-f',
  punct: '!-\\/:-@\\[-`{-~',
};

/** POSIX ERE (as written in configs for grep -E) → JS RegExp, case-insensitive like `grep -Ei`. */
export function ereToRegExp(ere: string): RegExp | undefined {
  const src = ere.replace(/\[:([a-z]+):\]/g, (m, name: string) => POSIX_CLASSES[name] ?? m);
  try {
    return new RegExp(src, 'i');
  } catch {
    return undefined;
  }
}

export const FIX_LOCKS = ['.sdlc/fix-lock', '.claude/.sdlc-fix-lock'];
export const fixLockActive = (root: string) => FIX_LOCKS.some((p) => existsSync(join(root, p)));

export function checkProtected(ctx: PolicyContext, path: string, locale: Locale): Decision {
  const rel = relPath(ctx.root, path);
  const glob = matchAny(rel, ctx.loaded?.config.protected_paths);
  if (!glob) return ALLOW;
  return { action: 'deny', policy: 'protected-paths', message: t(locale, 'protected.deny', { path: rel, glob, config: ctx.loaded!.path }) };
}

export function checkSecrets(ctx: PolicyContext, content: string | undefined, locale: Locale): Decision {
  if (!content) return ALLOW;
  for (const pattern of [...BUILTIN_SECRET_PATTERNS, ...(ctx.loaded?.config.secret_patterns_extra ?? [])]) {
    const m = ereToRegExp(pattern)?.exec(content);
    if (m) {
      // only a prefix, so the secret is not echoed back in full
      return { action: 'deny', policy: 'secrets', message: t(locale, 'secret.deny', { preview: m[0].slice(0, 12), pattern }) };
    }
  }
  return ALLOW;
}

export function checkTestLock(ctx: PolicyContext, path: string, locale: Locale): Decision {
  if (!fixLockActive(ctx.root)) return ALLOW;
  const rel = relPath(ctx.root, path);
  const glob = matchAny(rel, ctx.loaded?.config.test_globs);
  if (!glob) return ALLOW;
  return { action: 'deny', policy: 'test-lock', message: t(locale, 'testlock.deny', { path: rel, glob }) };
}

const MENTION_ONLY = new Set(['git', 'gh', 'glab', 'echo', 'printf', 'cat', 'grep', 'rg', 'jq']);

export function checkProductionGate(ctx: PolicyContext, command: string, locale: Locale): Decision {
  const gate = ctx.loaded?.config.production_gate;
  const envName = gate?.approval_env || 'RELEASE_APPROVAL';
  if ((ctx.env ?? process.env)[envName]) return ALLOW;
  // Each segment separately, skipping those that only *mention* a deploy (commit messages, echo).
  // Splitting on separators inside quotes errs on the side of blocking.
  for (const seg of command.split(/&&|\|\||;|\||\n/)) {
    const first = seg.replace(/^\s*([A-Za-z_][A-Za-z0-9_]*=\S*\s+)*/, '').trim().split(/\s+/)[0];
    if (MENTION_ONLY.has(first)) continue;
    for (const pattern of gate?.patterns ?? []) {
      if (ereToRegExp(pattern)?.test(seg)) {
        return { action: 'deny', policy: 'production-gate', message: t(locale, 'prodgate.deny', { pattern, env: envName }) };
      }
    }
  }
  return ALLOW;
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export function runFormatOnEdit(ctx: PolicyContext, path: string, locale: Locale): Decision {
  const full = path.startsWith('/') ? path : join(ctx.root, path);
  if (!existsSync(full)) return ALLOW;
  const rel = relPath(ctx.root, full);
  const entry = Object.entries(ctx.loaded?.config.format_on_edit ?? {}).find(
    ([glob]) => globMatch(rel, glob) || globMatch(basename(rel), glob),
  );
  if (!entry) return ALLOW;
  const cmd = entry[1].replaceAll('{file}', shellQuote(full));
  try {
    execSync(cmd, { cwd: ctx.root, stdio: ['ignore', 'pipe', 'pipe'], shell: '/bin/bash', timeout: 60_000 });
    return ALLOW;
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const out = `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}`.trim();
    return { action: 'warn', policy: 'format-on-edit', message: t(locale, 'format.fail', { path: rel, cmd, out }) };
  }
}

/** Files changed in the working tree (porcelain; for renames, the new path). */
function dirtyFiles(root: string): string[] {
  return lines(git(root, ['status', '--porcelain'])).map((l) => l.slice(3).split(' -> ').pop()!.replace(/^"|"$/g, ''));
}

export function checkPlanSync(ctx: PolicyContext, locale: Locale): Decision {
  const change = activeChange(ctx.root);
  if (!change || !existsSync(join(ctx.root, change, 'plan.md'))) return ALLOW;
  let code = false;
  let plan = false;
  for (const f of dirtyFiles(ctx.root)) {
    if (f === `${change}/plan.md`) plan = true;
    else if (isCodePath(f)) code = true;
  }
  return code && !plan ? { action: 'warn', policy: 'plan-sync', message: t(locale, 'plansync.remind', { change }) } : ALLOW;
}

export function sessionContext(ctx: PolicyContext, locale: Locale): Decision {
  const { root, loaded } = ctx;
  if (!loaded) {
    return existsSync(join(root, '.git')) ? { action: 'context', message: t(locale, 'session.noconfig') } : ALLOW;
  }
  const out = [t(locale, 'session.config', { config: loaded.path })];
  const change = activeChange(root);
  if (change) {
    const c = listChanges(root, { locale, defaultBranch: loaded.config.vcs?.default_branch }).find((x) => x.id === change);
    const stage = c?.stage ?? 'no-intent';
    out.push(t(locale, 'session.active', { branch: currentBranch(root) ?? '', change, stage, ticket: c?.ticket ?? '' }));
    out.push(t(locale, 'session.next', { next: c?.next ?? t(locale, 'next.no-intent') }));
  } else {
    out.push(t(locale, 'session.noactive'));
  }
  if (fixLockActive(root)) out.push(t(locale, 'session.lock'));
  const setup = join(root, 'SETUP.md');
  if (existsSync(setup)) {
    const n = (readFileSync(setup, 'utf8').match(/⬜/g) ?? []).length;
    if (n > 0) out.push(t(locale, 'session.setup', { n }));
  }
  return { action: 'context', message: out.join('\n') };
}

/**
 * Evaluate an event against every guardrail that applies. Returns the first deny, otherwise the
 * warnings/context collected. Projects without config get no guardrails (nothing to enforce).
 */
export function evaluate(event: HookEvent, ctx: PolicyContext): Decision[] {
  const locale = localeOf(ctx.loaded);
  if (!ctx.loaded && event.kind !== 'session.start') return [ALLOW];
  const results: Decision[] = [];
  const run = (...checks: (() => Decision)[]) => {
    for (const check of checks) {
      const d = check();
      if (d.action === 'deny') return [d];
      if (d.action !== 'allow') results.push(d);
    }
    return results.length ? results : [ALLOW];
  };
  switch (event.kind) {
    case 'file.edit':
      if (event.phase === 'post') return run(() => runFormatOnEdit(ctx, event.path, locale));
      return run(
        () => checkProtected(ctx, event.path, locale),
        () => checkSecrets(ctx, event.content, locale),
        () => checkTestLock(ctx, event.path, locale),
      );
    case 'file.read':
      return run(() => checkSecrets(ctx, event.content, locale));
    case 'prompt':
      return run(() => checkSecrets(ctx, event.text, locale));
    case 'shell.exec':
      return run(() => checkProductionGate(ctx, event.command, locale));
    case 'session.stop':
      return event.stopHookActive ? [ALLOW] : run(() => checkPlanSync(ctx, locale));
    case 'session.start':
      return run(() => sessionContext(ctx, locale));
  }
}
