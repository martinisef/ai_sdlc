// Adoption funnel: how far changes get through the loop (from git, shared by the team) and how long the
// first steps took on this machine (from the local activity log).
import { listChanges, type Change, type Stage } from './changes.ts';
import type { LoadedConfig } from './config.ts';
import { readEvents, type SdlcEvent } from './events.ts';

export const FUNNEL_STEPS = ['started', 'intent-accepted', 'spec-approved', 'plan-approved', 'building', 'merged'] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

const RANK: Record<Stage, number> = {
  'no-intent': 0,
  'intent-draft': 0,
  'intent-accepted': 1,
  'spec-draft': 1,
  'spec-approved': 2,
  'plan-draft': 2,
  'plan-approved': 3,
  'quick-ready': 3,
  building: 4,
  merged: 5,
  rejected: -1,
};

export interface Funnel {
  /** Full-loop changes that reached each step. */
  loop: Record<FunnelStep, number>;
  quick: { started: number; merged: number; promoted: number };
  rejected: number;
  /** Local milestones: minutes from `sdlc init` to each first, when the log has them. */
  firsts: { change?: number; gate?: number; quick?: number };
}

function rankOf(c: Change): number {
  if (c.stage !== 'rejected') return RANK[c.stage];
  if (c.artifacts.plan?.status === 'rejected') return 2;
  if (c.artifacts.spec?.status === 'rejected') return 1;
  return 0;
}

function minutesBetween(a?: SdlcEvent, b?: SdlcEvent): number | undefined {
  if (!a || !b) return undefined;
  return Math.max(0, Math.round((Date.parse(b.ts) - Date.parse(a.ts)) / 60_000));
}

export function funnel(root: string, loaded: LoadedConfig | undefined, opts: { changes?: Change[]; events?: SdlcEvent[] } = {}): Funnel {
  const changes = opts.changes ?? listChanges(root, { defaultBranch: loaded?.config.vcs?.default_branch });
  const events = opts.events ?? readEvents(root, 5000);
  const loop = Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0])) as Record<FunnelStep, number>;
  const quick = { started: 0, merged: 0, promoted: 0 };
  let rejected = 0;
  for (const c of changes) {
    const lane = c.artifacts.intent?.data.lane;
    if (lane === 'quick' || lane === 'full') quick.started++;
    if (lane === 'full') quick.promoted++;
    if (lane === 'quick') {
      if (c.stage === 'merged') quick.merged++;
      continue;
    }
    if (c.stage === 'rejected') rejected++;
    const r = rankOf(c);
    FUNNEL_STEPS.forEach((s, i) => {
      if (r >= i) loop[s]++;
    });
  }
  const first = (type: SdlcEvent['type']) => events.find((e) => e.type === type);
  const init = first('setup.init');
  return {
    loop,
    quick,
    rejected,
    firsts: { change: minutesBetween(init, first('change.new')), gate: minutesBetween(init, first('gate.approve')), quick: minutesBetween(init, first('change.quick')) },
  };
}
