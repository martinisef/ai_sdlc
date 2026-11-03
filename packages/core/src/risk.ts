// Risk tiers set by the change, not by the author: a deterministic classifier over the diff (paths, size,
// dependencies, deletions) and the files the spec/plan name. A second, agent classifier may only raise the tier.
import type { Change } from './changes.ts';
import { isCodePath } from './changes.ts';
import type { LoadedConfig } from './config.ts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureSdlcDir } from './events.ts';
import { git, lines } from './git.ts';
import { matchAny } from './glob.ts';

export const RISK_TIERS = ['low', 'medium', 'high'] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

/** CI workflows and the loop's own configuration: a change that edits the checks is never low risk. */
export const ALWAYS_HUMAN_DEFAULTS = ['.github/workflows/**', '.gitlab-ci.yml', 'ci/*.gitlab-ci.yml', 'bitbucket-pipelines.yml', '.sdlc/**', 'REVIEW.md'];

export const DEPENDENCY_MANIFESTS = [
  '**/package.json',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/pyproject.toml',
  '**/uv.lock',
  '**/poetry.lock',
  '**/requirements*.txt',
  '**/go.mod',
  '**/go.sum',
  '**/Gemfile',
  '**/Gemfile.lock',
  '**/*.csproj',
  '**/Cargo.toml',
  '**/Cargo.lock',
  '**/pom.xml',
  '**/build.gradle*',
];

export const RISK_SIZE_DEFAULTS = { low_max_lines: 50, high_min_lines: 800 };

export interface FileChange {
  path: string;
  /** git name-status letter: A added, M modified, D deleted, R renamed. */
  status: 'A' | 'M' | 'D' | 'R';
  added: number;
  deleted: number;
}

export interface RiskReason {
  tier: RiskTier;
  reason: string;
}

export interface RiskAssessment {
  tier: RiskTier;
  /** Why the tier is above low; empty when low. */
  reasons: RiskReason[];
  /** Weighted changed lines of code: modified and deleted lines count fully, lines in new files count half. */
  weight: number;
  files: number;
}

export const tierRank = (t: RiskTier) => RISK_TIERS.indexOf(t);
export const maxTier = (...ts: (RiskTier | undefined)[]): RiskTier =>
  ts.reduce<RiskTier>((a, b) => (b && tierRank(b) > tierRank(a) ? b : a), 'low');

/** `risk:` as people write it in a spec (`high`, `routine`, `medium — touches billing`) → a tier. */
export function parseTier(v: string | undefined): RiskTier | undefined {
  const s = v?.trim().toLowerCase() ?? '';
  if (/^(high|alto|alta)\b/.test(s)) return 'high';
  if (/^(medium|medio|media)\b/.test(s)) return 'medium';
  if (/^(low|bajo|baja|routine|rutina)\b/.test(s)) return 'low';
  return undefined;
}

export function riskSettings(loaded: LoadedConfig | undefined) {
  const r = loaded?.config.risk ?? {};
  return {
    highRisk: r.high_risk_paths ?? [],
    alwaysHuman: r.always_human_paths ?? ALWAYS_HUMAN_DEFAULTS,
    lowMaxLines: r.size?.low_max_lines ?? RISK_SIZE_DEFAULTS.low_max_lines,
    highMinLines: r.size?.high_min_lines ?? RISK_SIZE_DEFAULTS.high_min_lines,
    tests: loaded?.config.test_globs ?? [],
    sensitive: [...(loaded?.config.protected_paths ?? []), ...(loaded?.config.append_only_paths ?? [])],
  };
}

/** Deterministic tier of a set of changed files. */
export function classifyRisk(loaded: LoadedConfig | undefined, files: FileChange[]): RiskAssessment {
  const s = riskSettings(loaded);
  const reasons: RiskReason[] = [];
  const first = (tier: RiskTier, pick: (f: FileChange) => string | undefined, why: (f: FileChange, m: string) => string) => {
    for (const f of files) {
      const m = pick(f);
      if (m) return void reasons.push({ tier, reason: why(f, m) });
    }
  };
  first('high', (f) => matchAny(f.path, s.highRisk), (f, m) => `${f.path} is a high-risk path (${m})`);
  first('medium', (f) => matchAny(f.path, s.alwaysHuman), (f, m) => `${f.path} always needs a person (${m})`);
  first('medium', (f) => matchAny(f.path, DEPENDENCY_MANIFESTS), (f) => `${f.path} changes dependencies`);
  first('medium', (f) => matchAny(f.path, s.sensitive), (f, m) => `${f.path} is protected or append-only (${m})`);
  const code = files.filter((f) => isCodePath(f.path) && !matchAny(f.path, s.tests));
  first('medium', (f) => (code.includes(f) && f.status === 'D' ? 'deleted' : undefined), (f) => `${f.path} is deleted`);
  const weight = Math.round(code.reduce((n, f) => n + (f.status === 'A' ? f.added / 2 : f.added + f.deleted), 0));
  if (weight >= s.highMinLines) reasons.push({ tier: 'high', reason: `${weight} weighted lines of code changed (risk.size.high_min_lines: ${s.highMinLines})` });
  else if (weight > s.lowMaxLines) reasons.push({ tier: 'medium', reason: `${weight} weighted lines of code changed (risk.size.low_max_lines: ${s.lowMaxLines})` });
  reasons.sort((a, b) => tierRank(b.tier) - tierRank(a.tier));
  return { tier: maxTier(...reasons.map((r) => r.tier)), reasons, weight, files: files.length };
}

/** Files changed between `base` and `head` (merge base), with line counts. Empty when `base` is unknown. */
export function diffFiles(root: string, base: string, head = 'HEAD'): FileChange[] {
  if (git(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) === undefined) return [];
  const range = `${base}...${head}`;
  const counts = new Map<string, [number, number]>();
  for (const l of lines(git(root, ['diff', '--numstat', '-M', range]))) {
    const [a, d, ...p] = l.split('\t');
    const path = p.join('\t').replace(/^.*=> /, '').replace(/[{}]/g, '');
    counts.set(path, [Number(a) || 0, Number(d) || 0]);
  }
  return lines(git(root, ['diff', '--name-status', '-M', range])).map((l) => {
    const [st, ...paths] = l.split('\t');
    const path = paths.at(-1)!;
    const [added, deleted] = counts.get(path) ?? [0, 0];
    return { path, status: (st[0] === 'R' ? 'R' : st[0] === 'A' ? 'A' : st[0] === 'D' ? 'D' : 'M') as FileChange['status'], added, deleted };
  });
}

/** Paths the spec and plan name (`src/x.ts`, `infra/**`): the planned blast radius before any code exists. */
export function plannedFiles(change: Pick<Change, 'artifacts'>): string[] {
  const text = [change.artifacts.spec?.body, change.artifacts.plan?.body].filter(Boolean).join('\n');
  const found = new Set<string>();
  for (const m of text.matchAll(/`([^`\s]+)`/g)) {
    const p = m[1].replace(/^\.\//, '');
    if (/^[\w.*-]+(\/[\w.*@-]+)*\/$|^[\w.*-]+(\/[\w.*@-]+)+$|^[\w-]+\.[a-z]{1,5}$/i.test(p) && !/^https?:/.test(p)) found.add(p.replace(/\/$/, '/**'));
  }
  return [...found];
}

export interface ChangeRisk extends RiskAssessment {
  /** The `risk:` written in spec.md or plan.md. */
  declared?: RiskTier;
  /** Raised by the second (agent) classifier, or by the circuit breaker. */
  escalated?: RiskTier;
  computed: RiskTier;
}

/**
 * Effective tier of a change: the highest of what the spec declares, what the diff against `base` shows,
 * what the spec/plan say they will touch, and any escalation. Nothing here can lower a tier.
 */
export function changeRisk(
  root: string,
  loaded: LoadedConfig | undefined,
  change: Pick<Change, 'artifacts' | 'risk'> | undefined,
  opts: { base?: string; head?: string; escalated?: RiskTier; escalatedReason?: string; now?: Date } = {},
): ChangeRisk {
  const diff = opts.base ? diffFiles(root, opts.base, opts.head) : [];
  const planned = change ? plannedFiles(change).map((path) => ({ path, status: 'M' as const, added: 0, deleted: 0 })) : [];
  const seen = new Set(diff.map((f) => f.path));
  const a = classifyRisk(loaded, [...diff, ...planned.filter((f) => !seen.has(f.path))]);
  const declared = parseTier(change?.risk);
  const reasons = [...a.reasons];
  if (declared && tierRank(declared) > tierRank(a.tier)) reasons.unshift({ tier: declared, reason: `the spec declares risk: ${declared}` });
  if (opts.escalated && tierRank(opts.escalated) > tierRank(maxTier(a.tier, declared)))
    reasons.unshift({ tier: opts.escalated, reason: opts.escalatedReason ?? `escalated to ${opts.escalated}` });
  const floor = readRiskFloor(root, opts.now);
  if (floor && tierRank(floor.tier) > tierRank(maxTier(a.tier, declared, opts.escalated)))
    reasons.unshift({ tier: floor.tier, reason: `circuit breaker until ${floor.until}: ${floor.reason}` });
  return { ...a, reasons, declared, escalated: opts.escalated, computed: a.tier, tier: maxTier(a.tier, declared, opts.escalated, floor?.tier) };
}

/** A temporary minimum tier, set by `sdlc bands check` when reverts or incidents leave their band. */
export interface RiskFloor {
  tier: RiskTier;
  /** ISO date-time; the floor no longer applies after it. */
  until: string;
  reason: string;
}

export const RISK_FLOOR_PATH = '.sdlc/risk-floor.json';
/** Where CI keeps the floor so every pipeline sees it: a ref outside the branches, holding floor.json. */
export const RISK_FLOOR_REF = 'refs/sdlc/risk-floor';

function parseFloor(raw: string | undefined): RiskFloor | undefined {
  if (!raw) return undefined;
  try {
    const f = JSON.parse(raw) as RiskFloor;
    return RISK_TIERS.includes(f.tier) && !Number.isNaN(Date.parse(f.until)) ? f : undefined;
  } catch {
    return undefined;
  }
}

/** The floor in force now: the local file or the ref, whichever is higher. */
export function readRiskFloor(root: string, now = new Date()): RiskFloor | undefined {
  const local = existsSync(join(root, RISK_FLOOR_PATH)) ? readFileSync(join(root, RISK_FLOOR_PATH), 'utf8') : undefined;
  const fromRef = git(root, ['cat-file', '-p', `${RISK_FLOOR_REF}:floor.json`]);
  const active = [parseFloor(local), parseFloor(fromRef)].filter((f): f is RiskFloor => !!f && Date.parse(f.until) > now.getTime());
  return active.sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || b.until.localeCompare(a.until))[0];
}

/** Records the floor in the file and in RISK_FLOOR_REF (a commit with floor.json); never lowers one in force. */
export function writeRiskFloor(root: string, floor: RiskFloor, now = new Date()): RiskFloor {
  const current = readRiskFloor(root, now);
  const next = current && (tierRank(current.tier) > tierRank(floor.tier) || (current.tier === floor.tier && current.until > floor.until)) ? current : floor;
  const json = JSON.stringify(next, null, 2) + '\n';
  ensureSdlcDir(root);
  writeFileSync(join(root, RISK_FLOOR_PATH), json);
  const blob = git(root, ['hash-object', '-w', '--stdin'], json);
  const tree = blob && git(root, ['mktree'], `100644 blob ${blob}\tfloor.json\n`);
  const commit = tree && git(root, ['-c', 'user.name=sdlc', '-c', 'user.email=sdlc@localhost', 'commit-tree', tree, '-m', `risk floor ${next.tier} until ${next.until}`]);
  if (commit) git(root, ['update-ref', RISK_FLOOR_REF, commit]);
  return next;
}

/** CI checkouts do not fetch RISK_FLOOR_REF; bring it in so the floor applies there too. Silent when absent. */
export function fetchRiskFloor(root: string): void {
  if (git(root, ['remote', 'get-url', 'origin'])) git(root, ['fetch', '-q', 'origin', `+${RISK_FLOOR_REF}:${RISK_FLOOR_REF}`]);
}

export function pushRiskFloor(root: string): boolean {
  return !!git(root, ['remote', 'get-url', 'origin']) && git(root, ['push', '-q', '-f', 'origin', `${RISK_FLOOR_REF}:${RISK_FLOOR_REF}`]) !== undefined;
}

/** Marker the second classifier leaves on the PR; it can only raise the tier, so its author needs no trust. */
export const RISK_MARKER = /<!-- sdlc:risk tier=(low|medium|high)(?: reason="([^"]*)")? -->/;

export function riskMarker(tier: RiskTier, reason: string): string {
  return `<!-- sdlc:risk tier=${tier} reason="${reason.replace(/"|-->/g, "'")}" -->`;
}

/** Highest escalation recorded in the PR's comments. */
export function escalationFrom(bodies: string[]): { tier?: RiskTier; reason?: string } {
  let best: { tier?: RiskTier; reason?: string } = {};
  for (const b of bodies) {
    const m = RISK_MARKER.exec(b);
    if (m && (!best.tier || tierRank(m[1] as RiskTier) > tierRank(best.tier))) best = { tier: m[1] as RiskTier, reason: m[2] };
  }
  return best;
}

/** Second classifier's answer: the last `ESCALATE: none|medium|high — reason` line. */
export function parseEscalation(out: string): { tier?: RiskTier; reason?: string } {
  const m = [...out.matchAll(/^\s*\**ESCALATE:?\**\s*:?\s*(none|low|medium|high)\b[\s:—–-]*(.*)$/gim)].at(-1);
  if (!m || m[1].toLowerCase() === 'none') return {};
  return { tier: m[1].toLowerCase() as RiskTier, reason: m[2].trim() || undefined };
}
