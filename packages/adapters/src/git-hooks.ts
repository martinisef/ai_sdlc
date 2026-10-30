// Git hooks: the agent-independent layer. They enforce at commit/push time what agents without
// pre-action hooks (Cursor edits, AGENTS.md agents) cannot be stopped from doing at edit time.
import {
  checkProtected,
  checkSecrets,
  checkTestLock,
  currentBranch,
  git,
  isApproved,
  isCodePath,
  lines,
  listChanges,
  loadConfig,
  localeOf,
  recordEvent,
  t,
  type Decision,
  type PolicyId,
} from '@ai-native-sdlc/core';
import type { HookOutput } from './hooks.ts';

function overrides(env: NodeJS.ProcessEnv): Set<string> {
  return new Set((env.SDLC_OVERRIDE ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

function block(root: string, d: Extract<Decision, { action: 'deny' }>, env: NodeJS.ProcessEnv, locale: 'en' | 'es'): HookOutput | undefined {
  const ov = overrides(env);
  if (ov.has(d.policy) || ov.has('all')) {
    recordEvent(root, { type: 'guardrail.override', agent: 'git', policy: d.policy, by: git(root, ['config', 'user.email']), detail: d.message.split('\n')[0] });
    return undefined;
  }
  recordEvent(root, { type: 'guardrail.block', agent: 'git', policy: d.policy, detail: d.message.split('\n')[0] });
  return { stderr: `${d.message}\n${t(locale, 'git.override', { policy: d.policy })}`, exitCode: 1 };
}

/** pre-commit: protected paths, test-lock and secrets over the staged changes. */
export function preCommit(root: string, env: NodeJS.ProcessEnv = process.env): HookOutput {
  const loaded = loadConfig(root);
  if (!loaded) return { exitCode: 0 };
  const locale = localeOf(loaded);
  const ctx = { root, loaded, env };
  const staged = lines(git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']));
  for (const file of staged) {
    for (const d of [checkProtected(ctx, file, locale), checkTestLock(ctx, file, locale)]) {
      if (d.action === 'deny') {
        const out = block(root, d, env, locale);
        if (out) return out;
      }
    }
  }
  // only added lines: a secret that was already in the repo is not this commit's doing
  const added = lines(git(root, ['diff', '--cached', '-U0', '--diff-filter=ACMR']))
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n');
  const d = checkSecrets(ctx, added, locale);
  if (d.action === 'deny') {
    const out = block(root, d, env, locale);
    if (out) return out;
  }
  return { exitCode: 0 };
}

/** pre-push: on change/* branches, code only ships once the plan is approved ("plan before code"). */
export function prePush(root: string, env: NodeJS.ProcessEnv = process.env): HookOutput {
  const loaded = loadConfig(root);
  if (!loaded) return { exitCode: 0 };
  const locale = localeOf(loaded);
  const branch = currentBranch(root);
  if (!branch?.startsWith('change/')) return { exitCode: 0 };
  const base = loaded.config.vcs?.default_branch ?? 'main';
  const code = lines(git(root, ['diff', '--name-only', `${base}...HEAD`])).filter(isCodePath);
  if (code.length === 0) return { exitCode: 0 };
  const change = listChanges(root, { locale, defaultBranch: base }).find((c) => c.active);
  if (!change || isApproved(change.artifacts.plan?.status)) return { exitCode: 0 };
  const policy: PolicyId = 'plan-first';
  const d: Decision = { action: 'deny', policy, message: t(locale, 'prepush.noplan', { branch, change: change.id, stage: change.stage }) };
  return block(root, d, env, locale) ?? { exitCode: 0 };
}
