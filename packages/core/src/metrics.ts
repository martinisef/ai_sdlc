// Leading indicators of the playbook, from data that already exists (git history + the local event log).
import { listChanges, type Change } from './changes.ts';
import { readEvents } from './events.ts';
import { git, lines } from './git.ts';
import type { Locale } from './i18n.ts';

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

export function changeMetrics(root: string, c: Change): ChangeMetrics {
  const ti = firstAdd(root, `${c.id}/intent.md`);
  const ts = firstAdd(root, `${c.id}/spec.md`);
  const tp = firstAdd(root, `${c.id}/plan.md`);
  return {
    change: c.id,
    stage: c.stage,
    origin: c.origin,
    intentToSpecH: hours(ti, ts),
    specToPlanH: hours(ts, tp),
    specReworkAfterPlan: tp !== undefined ? commitsAfter(root, `${c.id}/spec.md`, tp) : undefined,
    firstCommitAt: ti ? new Date(ti * 1000).toISOString() : undefined,
  };
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

export function metrics(root: string, opts: { locale?: Locale; defaultBranch?: string } = {}): { changes: ChangeMetrics[]; summary: Summary } {
  const all = listChanges(root, opts);
  const changes = all.map((c) => changeMetrics(root, c));
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
    },
  };
}
