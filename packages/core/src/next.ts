// "What do I do now?": one action for the person at the keyboard, from the config, the branch and the changes.
// Shared by `sdlc next`, the session-start hook, the dashboard and the editor extension.
import { listChanges, type Change, type Stage } from './changes.ts';
import { localeOf, type Artifact, type LoadedConfig } from './config.ts';
import { canApprove, requiredApprovers, type Approver } from './gates.ts';
import { gitUser } from './git.ts';
import { t, type Locale } from './i18n.ts';
import { canDecideRoadmap, checkRoadmap, listRoadmaps, nextStory } from './roadmap.ts';
import { trackerEnabled } from './tracker.ts';

export type NextKind = 'init' | 'new' | 'switch' | 'agent' | 'approve' | 'wait' | 'ship' | 'done' | 'rejected' | 'roadmap';

export interface NextAction {
  kind: NextKind;
  /** One sentence for a person. */
  message: string;
  /** Shell command to run, when the next step is a command. */
  command?: string;
  /** Agent skill to invoke, when the next step is the agent's. */
  skill?: string;
  change?: string;
  /** Roadmap slug, for `roadmap` actions. */
  roadmap?: string;
  stage?: Stage;
  artifact?: Artifact;
  /** Roles (or people) the change is waiting for, when it is not you. */
  waitingOn?: string[];
  /** Other gates this person can decide now, outside the active change. */
  inbox: { change: string; artifact: Artifact }[];
}

const SKILL: Partial<Record<Stage, string>> = {
  'no-intent': '/sdlc-intent',
  'intent-accepted': '/sdlc-spec',
  'spec-approved': '/sdlc-plan',
  'plan-approved': '/sdlc-build',
  'quick-ready': '/sdlc-quick',
  building: '/sdlc-ship',
};

const GATE: Partial<Record<Stage, Artifact>> = { 'intent-draft': 'intent', 'spec-draft': 'spec', 'plan-draft': 'plan' };

export function forChange(change: Change, loaded: LoadedConfig, who: Approver, locale: Locale): Omit<NextAction, 'inbox'> {
  const base = { change: change.slug, stage: change.stage };
  const gate = GATE[change.stage];
  if (gate) {
    const ok = canApprove(change, gate, who, loaded);
    if (ok.ok) {
      return { ...base, kind: 'approve', artifact: gate, command: `sdlc approve ${change.slug} ${gate}`, message: t(locale, 'nx.approve', { change: change.slug, artifact: gate }) };
    }
    const { roles, people } = requiredApprovers(change, gate, loaded);
    return {
      ...base,
      kind: 'wait',
      artifact: gate,
      waitingOn: people.length ? people : roles,
      message: t(locale, 'nx.wait', { change: change.slug, artifact: gate, who: (people.length ? people : roles).join(', ') || t(locale, 'nx.someone'), reason: ok.reason ?? '' }),
    };
  }
  if (change.stage === 'merged') return { ...base, kind: 'done', command: 'sdlc new <slug>', message: t(locale, 'nx.done', { change: change.slug }) };
  if (change.stage === 'rejected') return { ...base, kind: 'rejected', message: t(locale, 'next.rejected') };
  const skill = SKILL[change.stage] ?? '/sdlc-intent';
  return { ...base, kind: change.stage === 'building' ? 'ship' : 'agent', skill, message: t(locale, 'nx.agent', { skill, next: change.next }) };
}

export function nextAction(root: string, loaded: LoadedConfig | undefined, opts: { who?: Approver; changes?: Change[] } = {}): NextAction {
  const locale = localeOf(loaded);
  if (!loaded) return { kind: 'init', command: 'sdlc init', message: t(locale, 'nx.init'), inbox: [] };
  const who = opts.who ?? gitUser(root);
  const changes = opts.changes ?? listChanges(root, { locale, defaultBranch: loaded.config.vcs?.default_branch });
  const open = changes.filter((c) => c.stage !== 'merged' && c.stage !== 'rejected');
  const inbox = open
    .filter((c) => !c.active && GATE[c.stage] && canApprove(c, GATE[c.stage]!, who, loaded).ok)
    .map((c) => ({ change: c.slug, artifact: GATE[c.stage]! }));
  const active = changes.find((c) => c.active);
  if (active) return { ...forChange(active, loaded, who, locale), inbox };
  if (inbox[0]) {
    const { change, artifact } = inbox[0];
    return { kind: 'approve', change, artifact, command: `sdlc approve ${change} ${artifact}`, message: t(locale, 'nx.approve', { change, artifact }), inbox: inbox.slice(1) };
  }
  const roadmaps = listRoadmaps(root);
  const drafts = roadmaps.filter((r) => (r.data.status || 'draft') === 'draft').map((r) => ({ r, check: checkRoadmap(r) }));
  const ready = drafts.find((d) => !d.check.errors.length);
  if (ready && canDecideRoadmap(who, loaded).ok) {
    const roadmap = ready.r.slug;
    return { kind: 'roadmap', roadmap, command: `sdlc roadmap approve ${roadmap}`, message: t(locale, 'nx.roadmap.approve', { roadmap, stories: String(ready.check.stories) }), inbox };
  }
  const mine = open.find((c) => c.branch && (!c.author || c.author === who.name || c.author === who.email)) ?? open.find((c) => c.branch);
  if (mine) return { kind: 'switch', change: mine.slug, stage: mine.stage, command: `git checkout ${mine.branch}`, message: t(locale, 'nx.switch', { change: mine.slug, stage: mine.stage }), inbox };
  const unapplied = trackerEnabled(loaded) ? roadmaps.find((r) => r.data.status === 'approved' && r.items.some((i) => !i.fields.key)) : undefined;
  if (unapplied) {
    const missing = String(unapplied.items.filter((i) => !i.fields.key).length);
    return { kind: 'roadmap', roadmap: unapplied.slug, command: `sdlc roadmap apply ${unapplied.slug}`, message: t(locale, 'nx.roadmap.apply', { roadmap: unapplied.slug, missing }), inbox };
  }
  const story = nextStory(root, loaded);
  if (story) {
    const skill = `/sdlc-intent ${story.key}`;
    return { kind: 'new', roadmap: story.roadmap, skill, message: t(locale, 'nx.story', { roadmap: story.roadmap, id: story.id, title: story.title, key: story.key! }), inbox };
  }
  const draft = drafts.find((d) => d.check.errors.length);
  if (draft) {
    const problems = draft.check.open ? `${draft.check.open} open question(s)` : `${draft.check.errors.length} problem(s): sdlc roadmap check ${draft.r.slug}`;
    return { kind: 'roadmap', roadmap: draft.r.slug, skill: `/sdlc-roadmap ${draft.r.slug}`, message: t(locale, 'nx.roadmap.draft', { roadmap: draft.r.slug, problems }), inbox };
  }
  return { kind: 'new', command: 'sdlc new <slug>', message: t(locale, 'nx.new'), inbox };
}

/** One line for terminals and hook context. */
export function formatNext(n: NextAction): string {
  const how = n.command ? ` → ${n.command}` : n.skill && !n.message.includes(n.skill) ? ` → ${n.skill}` : '';
  return `${n.message}${how}`;
}
