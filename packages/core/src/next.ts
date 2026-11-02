// "What do I do now?": one action for the person at the keyboard, from the config, the branch and the changes.
// Shared by `sdlc next`, the session-start hook, the dashboard and the editor extension.
import { listChanges, type Change, type Stage } from './changes.ts';
import { localeOf, type Artifact, type LoadedConfig } from './config.ts';
import { canApprove, type Approver } from './gates.ts';
import { gitUser } from './git.ts';
import { t, type Locale } from './i18n.ts';

export type NextKind = 'init' | 'new' | 'switch' | 'agent' | 'approve' | 'wait' | 'ship' | 'done' | 'rejected';

export interface NextAction {
  kind: NextKind;
  /** One sentence for a person. */
  message: string;
  /** Shell command to run, when the next step is a command. */
  command?: string;
  /** Agent skill to invoke, when the next step is the agent's. */
  skill?: string;
  change?: string;
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

function rolesFor(change: Change, artifact: Artifact, loaded: LoadedConfig): string[] {
  const roles = loaded.config.gates?.[artifact] ?? [];
  return artifact === 'plan' && change.risk === 'high' && !roles.includes('tech-lead') ? [...roles, 'tech-lead'] : roles;
}

export function forChange(change: Change, loaded: LoadedConfig, who: Approver, locale: Locale): Omit<NextAction, 'inbox'> {
  const base = { change: change.slug, stage: change.stage };
  const gate = GATE[change.stage];
  if (gate) {
    const ok = canApprove(change, gate, who, loaded);
    if (ok.ok) {
      return { ...base, kind: 'approve', artifact: gate, command: `sdlc approve ${change.slug} ${gate}`, message: t(locale, 'nx.approve', { change: change.slug, artifact: gate }) };
    }
    const roles = rolesFor(change, gate, loaded);
    const people = roles.flatMap((r) => loaded.config.roles?.[r] ?? []);
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
  const mine = open.find((c) => c.branch && (!c.author || c.author === who.name || c.author === who.email)) ?? open.find((c) => c.branch);
  if (mine) return { kind: 'switch', change: mine.slug, stage: mine.stage, command: `git checkout ${mine.branch}`, message: t(locale, 'nx.switch', { change: mine.slug, stage: mine.stage }), inbox };
  return { kind: 'new', command: 'sdlc new <slug>', message: t(locale, 'nx.new'), inbox };
}

/** One line for terminals and hook context. */
export function formatNext(n: NextAction): string {
  const how = n.command ? ` → ${n.command}` : n.skill && !n.message.includes(n.skill) ? ` → ${n.skill}` : '';
  return `${n.message}${how}`;
}
