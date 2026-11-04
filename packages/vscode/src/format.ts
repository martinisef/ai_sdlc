// What the extension shows, as plain data: status bar text, the quick pick and the sidebar groups.
// No `vscode` import here, so it is tested with node --test like the rest of the repo.
import { ARTIFACTS, columnOf, type Artifact, type Column, type NextAction, type Stage } from '@ai-native-sdlc/core';

/** One line of `sdlc status --json`. */
export interface StatusLine {
  change: string;
  slug: string;
  title: string;
  stage: Stage;
  ticket: string;
  statuses: string;
  active: boolean;
  next: string;
}

export function parseStatus(out: string): StatusLine[] {
  return out
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as StatusLine);
}

export function parseNext(out: string): NextAction | undefined {
  try {
    return JSON.parse(out) as NextAction;
  } catch {
    return undefined;
  }
}

const ICON: Record<NextAction['kind'], string> = {
  init: '$(gear)',
  new: '$(add)',
  switch: '$(git-branch)',
  agent: '$(sparkle)',
  approve: '$(pass)',
  wait: '$(watch)',
  ship: '$(rocket)',
  done: '$(check-all)',
  rejected: '$(error)',
  roadmap: '$(list-tree)',
};

export function statusBar(next: NextAction | undefined): { text: string; tooltip: string } {
  if (!next) return { text: '$(circle-slash) sdlc', tooltip: 'AI SDLC: the sdlc CLI did not answer (see the AI SDLC output)' };
  const what: Record<NextAction['kind'], string> = {
    init: 'set up',
    new: 'start a change',
    switch: 'switch branch',
    agent: next.skill ?? 'ask the agent',
    approve: `approve ${next.artifact}`,
    wait: `waiting on ${next.waitingOn?.join(', ') || 'a person'}`,
    ship: 'ship',
    done: 'merged',
    rejected: 'rejected',
    roadmap: next.command?.replace(/^sdlc /, '') ?? next.skill ?? 'roadmap',
  };
  const subject = next.change ? `${next.change} · ` : next.roadmap ? `${next.roadmap} · ` : 'sdlc: ';
  const inbox = next.inbox.length ? ` $(inbox) ${next.inbox.length}` : '';
  const tooltip = [next.message, next.command ?? next.skill, next.inbox.length ? `${next.inbox.length} more gate(s) waiting on you` : '']
    .filter(Boolean)
    .join('\n');
  return { text: `${ICON[next.kind]} ${subject}${what[next.kind]}${inbox}`, tooltip };
}

export type MenuId = 'next' | 'open' | 'quick' | 'approve' | 'reject' | 'dashboard' | 'doctor';

export interface MenuItem {
  id: MenuId;
  label: string;
  description?: string;
  change?: string;
  artifact?: Artifact;
}

/** Artifacts that exist for a change, with their status (`intent/spec/plan`, `-` when missing). */
export function artifactsOf(line: StatusLine): { artifact: Artifact; status: string }[] {
  const s = line.statuses.split('/');
  return ARTIFACTS.map((artifact, i) => ({ artifact, status: s[i] ?? '-' })).filter((a) => a.status !== '-');
}

/** Gates the person can decide now: the active one plus the inbox, without duplicates. */
export function myGates(next: NextAction | undefined): { change: string; artifact: Artifact }[] {
  if (!next) return [];
  const all = [...(next.kind === 'approve' && next.change && next.artifact ? [{ change: next.change, artifact: next.artifact }] : []), ...next.inbox];
  return all.filter((g, i) => all.findIndex((x) => x.change === g.change && x.artifact === g.artifact) === i);
}

export function menuItems(next: NextAction | undefined, changes: StatusLine[]): MenuItem[] {
  const items: MenuItem[] = [];
  if (next && next.kind !== 'approve') items.push({ id: 'next', label: `$(arrow-right) ${next.message}`, description: next.command ?? next.skill });
  for (const g of myGates(next)) {
    items.push({ id: 'approve', label: `$(pass) Approve the ${g.artifact} of ${g.change}`, change: g.change, artifact: g.artifact });
    items.push({ id: 'reject', label: `$(circle-slash) Reject the ${g.artifact} of ${g.change}`, change: g.change, artifact: g.artifact });
  }
  const current = changes.find((c) => c.active) ?? changes.find((c) => c.slug === next?.change);
  if (current) {
    for (const a of artifactsOf(current)) items.push({ id: 'open', label: `$(file) Open ${a.artifact}.md`, description: `${current.slug} · ${a.status}`, change: current.change, artifact: a.artifact });
  }
  items.push({ id: 'quick', label: '$(zap) Quick change…', description: 'sdlc quick: no spec or plan, limits checked on push' });
  items.push({ id: 'dashboard', label: '$(dashboard) Open the dashboard', description: 'sdlc ui' });
  items.push({ id: 'doctor', label: '$(tools) Doctor --fix', description: 'repair what sdlc can, list the rest' });
  return items;
}

export interface TreeEntry {
  label: string;
  slug: string;
  description: string;
  change: string;
  artifact: Artifact;
  contextValue: 'gate' | 'change';
}

export interface TreeGroup {
  label: string;
  entries: TreeEntry[];
}

const COLUMNS: [Column, string][] = [
  ['intent', 'Intent'],
  ['spec', 'Spec'],
  ['plan', 'Plan'],
  ['build', 'Build'],
  ['merged', 'Merged'],
  ['rejected', 'Rejected'],
];

/** The artifact to open for a change at this stage. */
export function currentArtifact(stage: Stage): Artifact {
  if (stage.startsWith('spec')) return 'spec';
  if (stage.startsWith('plan') || stage === 'building' || stage === 'merged') return 'plan';
  return 'intent';
}

export function treeGroups(changes: StatusLine[], next: NextAction | undefined): TreeGroup[] {
  const groups: TreeGroup[] = [];
  const gates = myGates(next).flatMap((g) => {
    const line = changes.find((c) => c.slug === g.change);
    return line ? [{ label: line.slug, slug: line.slug, description: `${g.artifact} waiting for you`, change: line.change, artifact: g.artifact, contextValue: 'gate' as const }] : [];
  });
  if (gates.length) groups.push({ label: 'Waiting on my gate', entries: gates });
  for (const [col, label] of COLUMNS) {
    const entries = changes
      .filter((c) => columnOf(c.stage) === col)
      .map((c) => ({
        label: c.slug,
        slug: c.slug,
        description: [c.stage, c.ticket, c.active ? 'active' : ''].filter(Boolean).join(' · '),
        change: c.change,
        artifact: currentArtifact(c.stage),
        contextValue: 'change' as const,
      }));
    if (entries.length) groups.push({ label, entries });
  }
  return groups;
}
