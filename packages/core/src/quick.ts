// Quick lane: small, low-risk changes skip spec and plan. The limits are checked on every push, so a
// "quick" change that grows (more files, a high-risk path) is stopped and promoted to the full loop.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getChange, isCodePath, type Change } from './changes.ts';
import { localeOf, type LoadedConfig } from './config.ts';
import { recordEvent } from './events.ts';
import { setFrontmatter } from './frontmatter.ts';
import { git, lines } from './git.ts';
import { matchAny } from './glob.ts';
import { SdlcError } from './http.ts';

export const QUICK_DEFAULTS = { enabled: true, max_files: 10 };

export interface QuickLimits {
  enabled: boolean;
  maxFiles: number;
  forbid: string[];
}

export function quickLimits(loaded: LoadedConfig | undefined): QuickLimits {
  const q = loaded?.config.quick_lane ?? {};
  return {
    enabled: q.enabled ?? QUICK_DEFAULTS.enabled,
    maxFiles: q.max_files ?? QUICK_DEFAULTS.max_files,
    forbid: [...(q.forbid_paths ?? []), ...(loaded?.config.risk?.high_risk_paths ?? [])],
  };
}

export const isQuick = (c: Pick<Change, 'artifacts'>) => c.artifacts.intent?.data.lane === 'quick' && !c.artifacts.spec && !c.artifacts.plan;

export interface QuickCheck {
  ok: boolean;
  files: string[];
  reason?: string;
}

/** Code files a quick change may touch: at most `max_files`, none under `forbid_paths` or `risk.high_risk_paths`. */
export function checkQuick(loaded: LoadedConfig | undefined, files: string[]): QuickCheck {
  const lim = quickLimits(loaded);
  const code = files.filter(isCodePath);
  if (!lim.enabled) return { ok: false, files: code, reason: 'the quick lane is disabled (quick_lane.enabled: false)' };
  const risky = code.find((f) => matchAny(f, lim.forbid));
  if (risky) return { ok: false, files: code, reason: `${risky} is a high-risk path (risk.high_risk_paths / quick_lane.forbid_paths)` };
  if (code.length > lim.maxFiles) return { ok: false, files: code, reason: `${code.length} code files changed, more than quick_lane.max_files (${lim.maxFiles})` };
  return { ok: true, files: code };
}

/** Files changed on this branch against the base, plus uncommitted ones. */
export function branchFiles(root: string, base: string): string[] {
  const committed = git(root, ['rev-parse', '--verify', '--quiet', base]) !== undefined ? lines(git(root, ['diff', '--name-only', `${base}...HEAD`])) : [];
  const pending = lines(git(root, ['status', '--porcelain', '--untracked-files=all'])).map((l) => l.slice(3).replace(/^.* -> /, ''));
  return [...new Set([...committed, ...pending])];
}

/** Quick → full loop: drops the lane and leaves the intent as a draft for the PO. */
export function promote(root: string, loaded: LoadedConfig | undefined, changeId: string, by?: string): Change {
  const change = getChange(root, changeId, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch });
  if (!change) throw new SdlcError(`change ${changeId} not found`);
  const intent = change.artifacts.intent;
  if (!intent || intent.data.lane !== 'quick') throw new SdlcError(`${change.id} is not in the quick lane`);
  if (change.source !== 'worktree') throw new SdlcError(`${change.id} is on ${change.source.branch}; check it out to promote it`);
  const p = join(root, intent.path);
  const text = setFrontmatter(readFileSync(p, 'utf8'), { lane: 'full', status: 'draft' });
  writeFileSync(p, text);
  recordEvent(root, { type: 'change.promote', change: change.slug, by });
  return change;
}
