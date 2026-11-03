// Leading indicators of the playbook, from data that already exists (git history + the local event log), plus the
// human time each change costs and the guardrails that say whether spending less of it is safe (reverts, incidents).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACTS } from './config.ts';
import { listChanges, type Change } from './changes.ts';
import { ensureSdlcDir, readEvents } from './events.ts';
import { git, lines } from './git.ts';
import type { Locale } from './i18n.ts';
import { readRiskFloor, type RiskFloor } from './risk.ts';

export interface ChangeMetrics {
  change: string;
  stage: string;
  origin?: string;
  /** hours between the first commit adding each artifact */
  intentToSpecH?: number;
  specToPlanH?: number;
  /** commits to spec.md after the first plan.md commit (rework that leaked past design) */
  specReworkAfterPlan?: number;
  firstCommitAt?: string;
  /** Human approvals recorded by the gates on intent, spec and plan (automatic ones do not count). */
  humanApprovals?: number;
  /** Hours each artifact waited for its first human decision, summed. */
  waitingH?: number;
  /** From the PR cache (`sdlc metrics --prs`). */
  pr?: number;
  reviewRounds?: number;
  humanComments?: number;
}

export interface Spread {
  median?: number;
  p95?: number;
}

export interface Summary {
  changes: number;
  byStage: Record<string, number>;
  byOrigin: Record<string, number>;
  medianIntentToSpecH?: number;
  medianSpecToPlanH?: number;
  specReworkRate?: number;
  guardrailBlocks: Record<string, number>;
  gateDecisions: number;
  humanApprovals: Spread;
  waitingH: Spread;
  reviewRounds: Spread;
  humanComments: Spread;
  /** Commits on the default branch (first parent) in the window, reverts excluded. */
  landed: number;
  reverts: number;
  revertRate?: number;
  incidents: number;
  /** Incident-origin changes per other change. */
  incidentRate?: number;
  riskFloor?: RiskFloor;
}

/** What `sdlc metrics --prs` stores per change; the forge is the only place rounds and comments live. */
export interface PrStats {
  pr: number;
  rounds: number;
  humanComments: number;
}

export const PR_STATS_PATH = '.sdlc/pr-stats.json';

export function readPrStats(root: string): Record<string, PrStats> {
  const p = join(root, PR_STATS_PATH);
  if (!existsSync(p)) return {};
  try {
    return (JSON.parse(readFileSync(p, 'utf8')) as { changes?: Record<string, PrStats> }).changes ?? {};
  } catch {
    return {};
  }
}

export function writePrStats(root: string, changes: Record<string, PrStats>): void {
  ensureSdlcDir(root);
  writeFileSync(join(root, PR_STATS_PATH), JSON.stringify({ updatedAt: new Date().toISOString(), changes }, null, 2) + '\n');
}

/** First commit (epoch seconds) that added the file, on any branch. */
function firstAdd(root: string, path: string): number | undefined {
  const ts = lines(git(root, ['log', '--all', '--diff-filter=A', '--format=%ct', '--', path])).pop();
  return ts ? Number(ts) : undefined;
}

function commitsAfter(root: string, path: string, epoch: number): number {
  return lines(git(root, ['log', '--all', '--format=%ct', '--', path])).filter((t) => Number(t) > epoch).length;
}

const hours = (a?: number, b?: number) => (a !== undefined && b !== undefined ? Math.round(((b - a) / 3600) * 10) / 10 : undefined);

const GATE_SUBJECT = /^chore\(.+\): (approve|reject) (intent|spec|plan)$/;
const GATE_TRAILER = /^Gate: \S+ (\S+) by .+$/m;

/**
 * Human time on one artifact: approvals given by people, and how long the artifact waited for its first human
 * decision. Gate commits are recognised by their own subject, so squash and merge commits that repeat the
 * trailer are not counted twice; a rebase keeps the author date, which dedupes those.
 */
function gateTime(root: string, path: string): { approvals: number; waitingH?: number } {
  const log = (git(root, ['log', '--all', '--format=%at%x00%ct%x00%s%x00%B%x1e', '--', path]) ?? '').split('\x1e');
  const commits = log
    .map((r) => r.replace(/^\n/, '').split('\0'))
    .filter((f) => f.length >= 4)
    .map(([at, ct, subject, body]) => ({ at, ct: Number(ct), subject, trailer: GATE_SUBJECT.test(subject) ? GATE_TRAILER.exec(body) : null }))
    .sort((a, b) => a.ct - b.ct);
  const seen = new Set<string>();
  let approvals = 0;
  let lastEdit: number | undefined;
  let waitingH: number | undefined;
  for (const c of commits) {
    if (!c.trailer) {
      if (!GATE_SUBJECT.test(c.subject)) lastEdit = c.ct;
      continue;
    }
    const [line, status] = c.trailer;
    if (/ by sdlc \(risk \w+\)/.test(line)) continue;
    const key = `${c.at}|${c.trailer[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (status !== 'rejected') approvals++;
    if (waitingH === undefined && lastEdit !== undefined) waitingH = hours(lastEdit, c.ct);
  }
  return { approvals, waitingH };
}

export function changeMetrics(root: string, c: Change, prs: Record<string, PrStats> = {}): ChangeMetrics {
  const ti = firstAdd(root, `${c.id}/intent.md`);
  const ts = firstAdd(root, `${c.id}/spec.md`);
  const tp = firstAdd(root, `${c.id}/plan.md`);
  const gates = ARTIFACTS.filter((a) => c.artifacts[a]).map((a) => gateTime(root, `${c.id}/${a}.md`));
  const waits = gates.flatMap((g) => (g.waitingH !== undefined ? [g.waitingH] : []));
  const pr = prs[c.id];
  return {
    change: c.id,
    stage: c.stage,
    origin: c.origin,
    intentToSpecH: hours(ti, ts),
    specToPlanH: hours(ts, tp),
    specReworkAfterPlan: tp !== undefined ? commitsAfter(root, `${c.id}/spec.md`, tp) : undefined,
    firstCommitAt: ti ? new Date(ti * 1000).toISOString() : undefined,
    humanApprovals: gates.length ? gates.reduce((n, g) => n + g.approvals, 0) : undefined,
    waitingH: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) * 10) / 10 : undefined,
    pr: pr?.pr,
    reviewRounds: pr?.rounds,
    humanComments: pr?.humanComments,
  };
}

/** Nearest-rank percentile. */
export function percentile(xs: number[], p: number): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

function spread(xs: (number | undefined)[]): Spread {
  const v = xs.filter((x): x is number => x !== undefined);
  return { median: median(v), p95: percentile(v, 95) };
}

export const isRevert = (subject: string, body = '') => /^Revert "/.test(subject) || /^This reverts commit [0-9a-f]{7,}/m.test(body);

/** First-parent commits on the default branch since `since`, and how many of them are reverts. */
export function revertStats(root: string, branch: string, since?: Date): { landed: number; reverts: number } {
  const range = ['--first-parent', ...(since ? [`--since=${since.toISOString()}`] : []), '--format=%s%x00%b%x1e'];
  const out = git(root, ['log', branch, ...range]) ?? git(root, ['log', 'HEAD', ...range]) ?? '';
  const commits = out.split('\x1e').map((r) => r.replace(/^\n/, '').split('\0')).filter((f) => f[0]);
  const reverts = commits.filter(([s, b]) => isRevert(s, b)).length;
  return { landed: commits.length - reverts, reverts };
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

export function metrics(
  root: string,
  opts: { locale?: Locale; defaultBranch?: string; since?: Date } = {},
): { changes: ChangeMetrics[]; summary: Summary } {
  const prs = readPrStats(root);
  const all = listChanges(root, opts);
  const changes = all.map((c) => changeMetrics(root, c, prs));
  const inWindow = (m: ChangeMetrics) => !opts.since || (m.firstCommitAt !== undefined && m.firstCommitAt >= opts.since.toISOString());
  const recent = changes.filter(inWindow);
  const incidents = recent.filter((m) => m.origin === 'incident').length;
  const { landed, reverts } = revertStats(root, opts.defaultBranch ?? 'main', opts.since);
  const count = (key: (c: Change) => string | undefined) =>
    all.reduce<Record<string, number>>((acc, c) => {
      const k = key(c) ?? 'unknown';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const withPlan = changes.filter((m) => m.specReworkAfterPlan !== undefined);
  const events = readEvents(root, 10_000);
  const guardrailBlocks: Record<string, number> = {};
  for (const e of events) if (e.type === 'guardrail.block' && e.policy) guardrailBlocks[e.policy] = (guardrailBlocks[e.policy] ?? 0) + 1;
  return {
    changes,
    summary: {
      changes: all.length,
      byStage: count((c) => c.stage),
      byOrigin: count((c) => c.origin),
      medianIntentToSpecH: median(changes.flatMap((m) => (m.intentToSpecH !== undefined ? [m.intentToSpecH] : []))),
      medianSpecToPlanH: median(changes.flatMap((m) => (m.specToPlanH !== undefined ? [m.specToPlanH] : []))),
      specReworkRate: withPlan.length ? withPlan.filter((m) => (m.specReworkAfterPlan ?? 0) > 0).length / withPlan.length : undefined,
      guardrailBlocks,
      gateDecisions: events.filter((e) => e.type === 'gate.approve' || e.type === 'gate.reject').length,
      humanApprovals: spread(recent.map((m) => m.humanApprovals)),
      waitingH: spread(recent.map((m) => m.waitingH)),
      reviewRounds: spread(recent.map((m) => m.reviewRounds)),
      humanComments: spread(recent.map((m) => m.humanComments)),
      landed,
      reverts,
      revertRate: landed ? Math.round((reverts / landed) * 1000) / 1000 : undefined,
      incidents,
      incidentRate: recent.length > incidents ? Math.round((incidents / (recent.length - incidents)) * 1000) / 1000 : undefined,
      riskFloor: readRiskFloor(root),
    },
  };
}

/** Names `sdlc metrics --value` accepts, for a control band with a `command` source. */
export const METRIC_VALUES: Record<string, (s: Summary) => number | undefined> = {
  revert_rate: (s) => s.revertRate ?? 0,
  reverts: (s) => s.reverts,
  incident_rate: (s) => s.incidentRate ?? 0,
  incidents: (s) => s.incidents,
  human_approvals_median: (s) => s.humanApprovals.median,
  human_approvals_p95: (s) => s.humanApprovals.p95,
  waiting_hours_median: (s) => s.waitingH.median,
  waiting_hours_p95: (s) => s.waitingH.p95,
  review_rounds_median: (s) => s.reviewRounds.median,
  review_rounds_p95: (s) => s.reviewRounds.p95,
  human_comments_median: (s) => s.humanComments.median,
  spec_rework_rate: (s) => s.specReworkRate,
};
