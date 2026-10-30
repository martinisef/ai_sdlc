// Changes (changes/<slug>/) and their position in the loop, read from the working tree and change/* branches.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACTS, type Artifact } from './config.ts';
import { parseFrontmatter } from './frontmatter.ts';
import { currentBranch, git, lines } from './git.ts';
import { t, type Locale } from './i18n.ts';

export const STAGES = [
  'no-intent',
  'intent-draft',
  'intent-accepted',
  'spec-draft',
  'spec-approved',
  'plan-draft',
  'plan-approved',
  'building',
  'merged',
  'rejected',
] as const;
export type Stage = (typeof STAGES)[number];

/** Board columns. `in-review` is set by the server when the change has an open PR. */
export type Column = 'intent' | 'spec' | 'plan' | 'build' | 'review' | 'merged' | 'rejected';

export interface ArtifactInfo {
  path: string;
  status?: string;
  data: Record<string, string>;
  body: string;
  raw: string;
}

export interface Change {
  /** `changes/<dir>` */
  id: string;
  dir: string;
  slug: string;
  /** Where the artifacts were read from: the working tree or a change/* branch. */
  source: 'worktree' | { branch: string };
  branch?: string;
  active: boolean;
  stage: Stage;
  next: string;
  /** Artifact whose gate is pending (status draft), if any. */
  waitingFor?: Artifact;
  title?: string;
  ticket?: string;
  origin?: string;
  author?: string;
  risk?: string;
  artifacts: Partial<Record<Artifact, ArtifactInfo>>;
  /** `intent/spec/plan` statuses, `-` when missing. */
  statuses: string;
}

const APPROVED = new Set(['approved', 'accepted']);
export const isApproved = (s?: string) => !!s && APPROVED.has(s);

export function stageOf(artifacts: Partial<Record<Artifact, { status?: string }>>): Stage {
  for (const a of ARTIFACTS) if (artifacts[a]?.status === 'rejected') return 'rejected';
  if (artifacts.plan) return isApproved(artifacts.plan.status) ? 'plan-approved' : 'plan-draft';
  if (artifacts.spec) return isApproved(artifacts.spec.status) ? 'spec-approved' : 'spec-draft';
  if (artifacts.intent) return isApproved(artifacts.intent.status) ? 'intent-accepted' : 'intent-draft';
  return 'no-intent';
}

export function nextStep(stage: Stage, locale: Locale): string {
  if (stage === 'building') return t(locale, 'next.plan-approved');
  if (stage === 'merged') return '-';
  return t(locale, `next.${stage}`);
}

export function columnOf(stage: Stage, inReview = false): Column {
  if (inReview && (stage === 'plan-approved' || stage === 'building')) return 'review';
  switch (stage) {
    case 'no-intent':
    case 'intent-draft':
    case 'intent-accepted':
      return 'intent';
    case 'spec-draft':
    case 'spec-approved':
      return 'spec';
    case 'plan-draft':
    case 'plan-approved':
      return 'plan';
    case 'building':
      return 'build';
    default:
      return stage;
  }
}

/** Active change from the branch: change/<slug> → changes/<slug> or changes/<date>-<slug>. */
export function activeChange(root: string): string | undefined {
  const branch = currentBranch(root);
  if (!branch?.startsWith('change/')) return undefined;
  const slug = branch.slice('change/'.length);
  if (existsSync(join(root, 'changes', slug))) return `changes/${slug}`;
  const dated = safeReaddir(join(root, 'changes')).find((d) => d.endsWith(`-${slug}`));
  return `changes/${dated ?? slug}`;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
  } catch {
    return [];
  }
}

function changeBranches(root: string): string[] {
  return lines(git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/change/']));
}

/** Slug without the optional date prefix (2026-11-claims-status → claims-status). */
export function slugOf(dir: string): string {
  return dir.replace(/^\d{4}-\d{2}(-\d{2})?-/, '');
}

function readArtifact(root: string, dir: string, file: string, branches: string[]): { raw: string; branch?: string } | undefined {
  const p = join(root, 'changes', dir, file);
  if (existsSync(p)) return { raw: readFileSync(p, 'utf8') };
  for (const b of branches) {
    const raw = git(root, ['show', `${b}:changes/${dir}/${file}`]);
    if (raw !== undefined) return { raw, branch: b };
  }
  return undefined;
}

function branchFor(dir: string, all: string[]): string[] {
  const slug = slugOf(dir);
  return [`change/${dir}`, `change/${slug}`].filter((b, i, arr) => all.includes(b) && arr.indexOf(b) === i);
}

/** Implementation files, as opposed to loop artifacts, docs and agent/loop configuration. */
export function isCodePath(f: string): boolean {
  return !/^(changes|lessons|\.claude|\.sdlc|\.cursor|\.agents)\//.test(f) && !f.endsWith('.md');
}

/** True when the change branch has commits touching implementation files (implementation started). */
function hasCodeCommits(root: string, branch: string, base: string): boolean {
  return lines(git(root, ['diff', '--name-only', `${base}...${branch}`])).some(isCodePath);
}

export interface ListOptions {
  locale?: Locale;
  defaultBranch?: string;
}

export function listChanges(root: string, opts: ListOptions = {}): Change[] {
  const locale = opts.locale ?? 'en';
  const branches = changeBranches(root);
  const dirs = new Set(safeReaddir(join(root, 'changes')));
  for (const b of branches) {
    for (const d of lines(git(root, ['ls-tree', '-d', '--name-only', `${b}:changes/`]))) dirs.add(d);
  }
  dirs.delete('_templates');
  const active = activeChange(root);
  const base = opts.defaultBranch ?? 'main';
  const baseExists = git(root, ['rev-parse', '--verify', '--quiet', base]) !== undefined;

  return [...dirs].sort().map((dir) => {
    const own = branchFor(dir, branches);
    const artifacts: Partial<Record<Artifact, ArtifactInfo>> = {};
    let fromBranch: string | undefined;
    for (const a of ARTIFACTS) {
      const found = readArtifact(root, dir, `${a}.md`, own);
      if (!found) continue;
      fromBranch ??= found.branch;
      const { data, body } = parseFrontmatter(found.raw);
      artifacts[a] = { path: `changes/${dir}/${a}.md`, status: data.status || undefined, data, body, raw: found.raw };
    }
    let stage = stageOf(artifacts);
    const branch = own[0];
    if (stage === 'plan-approved') {
      if (branch && baseExists && hasCodeCommits(root, branch, base)) stage = 'building';
      // no change branch left and the approved plan is on the default branch → it was merged
      else if (!branch && baseExists && git(root, ['cat-file', '-e', `${base}:changes/${dir}/plan.md`]) !== undefined) stage = 'merged';
    }
    const waitingFor = ARTIFACTS.slice()
      .reverse()
      .find((a) => artifacts[a] && !isApproved(artifacts[a]!.status) && artifacts[a]!.status !== 'rejected');
    const intent = artifacts.intent;
    const title = (intent ?? artifacts.spec ?? artifacts.plan)?.body.match(/^#\s+(?:[^:\n]+:\s*)?(.+)$/m)?.[1]?.trim();
    return {
      id: `changes/${dir}`,
      dir,
      slug: slugOf(dir),
      source: fromBranch ? { branch: fromBranch } : 'worktree',
      branch,
      active: active === `changes/${dir}`,
      stage,
      next: nextStep(stage, locale),
      waitingFor,
      title,
      ticket: intent?.data.ticket || undefined,
      origin: intent?.data.origin || undefined,
      author: intent?.data.author || undefined,
      risk: artifacts.spec?.data.risk || artifacts.plan?.data.risk || undefined,
      artifacts,
      statuses: ARTIFACTS.map((a) => artifacts[a]?.status ?? '-').join('/'),
    };
  });
}

export function getChange(root: string, id: string, opts: ListOptions = {}): Change | undefined {
  const dir = id.replace(/^changes\//, '').replace(/\/$/, '');
  return listChanges(root, opts).find((c) => c.dir === dir || c.slug === dir);
}
