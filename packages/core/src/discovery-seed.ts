// `sdlc discovery seed`: the baseline of a project that started before its meetings were tracked. One feature row per
// tracker issue (open or closed), change, roadmap story and unmerged branch, in topics/_baseline.md, so a later request
// is checked against what already exists. Idempotent: rows are matched by their `seed · <kind> <id>` evidence and updated,
// never deleted; a person's call (reimplement, out of scope) is kept.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { listChanges } from './changes.ts';
import { localeOf, type LoadedConfig } from './config.ts';
import {
  appendChange,
  BASELINE_TOPIC,
  discoveryBase,
  discoveryDir,
  evidencePieces,
  nextId,
  noTicketLabel,
  parseTopic,
  replaceTableRows,
  repoLabel,
  statusLabel,
  topicTemplate,
  unmergedBranches,
  type DiscoveryLocale,
  type REPO_STATES,
} from './discovery.ts';
import { listRoadmaps, roadmapStatus } from './roadmap.ts';
import { trackerEnabled, trackerProvider, type IssueCategory, type Tracker } from './tracker.ts';

type FeatureStatus = 'requested' | 'in_progress' | 'done' | 'dropped';

interface Candidate {
  /** `change refunds`, `jira SHOP-12`, `branch feat/x`, `roadmap payments#E1.S2`. */
  identity: string;
  text: string;
  status: FeatureStatus;
  repo: keyof typeof REPO_STATES;
  tickets: string[];
  detail: string;
}

export interface SeedResult {
  path: string;
  added: string[];
  updated: string[];
  unchanged: number;
  counts: { tracker: number; changes: number; stories: number; branches: number };
  warnings: string[];
  dryRun: boolean;
}

/** Statuses a person sets on purpose: the seed does not overwrite them. */
const KEPT = new Set(['reimplement', 'out_of_scope']);
const CATEGORY: Record<IssueCategory, FeatureStatus> = { todo: 'requested', in_progress: 'in_progress', done: 'done', cancelled: 'dropped' };
const seedIdentity = (evidence: string) => evidencePieces(evidence).map((p) => /^seed · (\S+ \S+)/.exec(p)?.[1]).find(Boolean);
const BASELINE_TITLE = { en: 'Baseline', es: 'Estado inicial' };
const BASELINE_INTRO = {
  en: '<!-- Written by `sdlc discovery seed` from the tracker, changes/, the roadmaps and the unmerged branches. Run it again to refresh: rows are matched by their `seed · …` evidence and never deleted. Reimplement and out of scope are kept. -->',
  es: '<!-- Lo escribe `sdlc discovery seed` desde el tracker, changes/, los roadmaps y las ramas sin mergear. Volver a correrlo lo actualiza: las filas se reconocen por su evidencia `seed · …` y nunca se borran. Reimplementar y fuera de alcance se respetan. -->',
};

export async function seedDiscovery(
  root: string,
  loaded: LoadedConfig | undefined,
  o: { dryRun?: boolean; tracker?: () => Tracker; limit?: number; today?: string } = {},
): Promise<SeedResult> {
  const locale: DiscoveryLocale = localeOf(loaded);
  const warnings: string[] = [];
  const counts = { tracker: 0, changes: 0, stories: 0, branches: 0 };
  const candidates: Candidate[] = [];
  const byTicket = new Map<string, Candidate>();
  const add = (c: Candidate) => {
    candidates.push(c);
    for (const t of c.tickets) byTicket.set(t, c);
  };

  let base: string | undefined;
  try {
    base = discoveryBase(root, loaded);
  } catch (e) {
    warnings.push(`${(e as Error).message}: branches left out`);
  }
  const changes = listChanges(root, { locale, defaultBranch: base });
  const changeSlugs = new Set(changes.map((c) => c.slug));
  for (const c of changes) {
    counts.changes++;
    const merged = c.stage === 'merged';
    add({
      identity: `change ${c.slug}`,
      text: c.title ?? c.slug,
      status: merged ? 'done' : c.stage === 'rejected' ? 'dropped' : 'in_progress',
      repo: merged ? 'exists' : c.stage === 'building' ? 'partial' : 'missing',
      tickets: c.ticket ? [c.ticket] : [],
      detail: c.stage,
    });
  }
  // stories drafted from discovery (`source: topic#F2`) are already rows of their topic
  const fromDiscovery = new Set(listRoadmaps(root).flatMap((r) => r.items.filter((i) => /^[\w-]+#F\d+$/.test(i.fields.source ?? '')).map((i) => `${r.slug}#${i.id}`)));
  for (const s of roadmapStatus(root, loaded)) {
    if (s.change || (s.key && byTicket.has(s.key)) || fromDiscovery.has(`${s.roadmap}#${s.id}`)) continue;
    counts.stories++;
    add({ identity: `roadmap ${s.roadmap}#${s.id}`, text: s.title, status: 'requested', repo: 'missing', tickets: s.key ? [s.key] : [], detail: 'story' });
  }
  if (base) {
    for (const b of unmergedBranches(root, loaded)) {
      const short = b.name.replace(/^origin\//, '');
      if ((b.change && changeSlugs.has(b.change)) || b.tickets.some((t) => byTicket.has(t))) continue;
      counts.branches++;
      add({ identity: `branch ${short}`, text: b.subject || short, status: 'in_progress', repo: 'partial', tickets: b.tickets, detail: `+${b.ahead}, ${b.date}` });
    }
  }
  if (trackerEnabled(loaded) && o.tracker) {
    const provider = trackerProvider(loaded)!;
    try {
      for (const i of await o.tracker().search({ limit: o.limit ?? 500 })) {
        counts.tracker++;
        const status = CATEGORY[i.category ?? 'todo'];
        const known = byTicket.get(i.key);
        if (known) {
          known.detail += `; ${provider} ${i.key}: ${i.status}`;
          continue;
        }
        // a closed ticket says nothing about the code on the base branch: the agent checks it when a request touches it
        add({ identity: `${provider} ${i.key}`, text: i.summary, status, repo: 'unverified', tickets: [i.key], detail: i.status });
      }
    } catch (e) {
      warnings.push(`tracker not read (${(e as Error).message}): seeded from git only`);
    }
  } else warnings.push('no tracker configured: seeded from changes/, roadmaps and branches');

  const dir = discoveryDir(loaded);
  const path = `${dir}/topics/${BASELINE_TOPIC}.md`;
  const file = join(root, path);
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const raw = existsSync(file)
    ? readFileSync(file, 'utf8')
    : topicTemplate({ slug: BASELINE_TOPIC, title: BASELINE_TITLE[locale], created: today, locale, intro: BASELINE_INTRO[locale] });
  const topic = parseTopic(raw, BASELINE_TOPIC, path);
  const rows = topic.rows.filter((r) => r.table === 'features');
  const cells = rows.map((r) => ({ ...r.cells }));
  const index = new Map(rows.map((r, i) => [seedIdentity(r.cells.evidence ?? ''), i]));
  const added: string[] = [];
  const updated: string[] = [];
  let unchanged = 0;
  const all = [...topic.rows];
  for (const c of candidates) {
    const note = `seed · ${c.identity} (${c.detail})`;
    const row = {
      status: statusLabel('features', c.status, locale),
      repo: repoLabel(c.repo, locale),
      ticket: c.tickets.length ? c.tickets.join(', ') : noTicketLabel(locale),
    };
    const at = index.get(c.identity);
    if (at === undefined) {
      const id = nextId(all, 'features');
      all.push({ table: 'features', topic: BASELINE_TOPIC, id, cells: {}, line: 0 });
      cells.push({ id, text: c.text, ...row, blocked_by: '', evidence: note });
      added.push(id);
      continue;
    }
    const cur = cells[at];
    const next: Record<string, string> = { ...cur, ...row };
    if (KEPT.has(rows[at].status ?? '')) next.status = cur.status;
    // only the `seed · <identity> (<detail>)` prefix is the seed's; what a person added after it stays
    const pieces = evidencePieces(cur.evidence ?? '').map((p) => (seedIdentity(p) === c.identity ? p.replace(/^seed · \S+ \S+(?: \([^)]*\))?/, note) : p));
    next.evidence = (pieces.some((p) => seedIdentity(p) === c.identity) ? pieces : [note, ...pieces]).join(' <br> ');
    if (JSON.stringify(next) === JSON.stringify(cur)) unchanged++;
    else {
      cells[at] = next;
      updated.push(cur.id);
    }
  }
  if (!o.dryRun && (added.length || updated.length || !existsSync(file))) {
    let out = replaceTableRows(raw, 'features', cells, locale);
    if (added.length || updated.length) out = appendChange(out, `- seed: ${today} · ${added.length} added, ${updated.length} updated`, locale);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, out);
  }
  return { path, added, updated, unchanged, counts, warnings, dryRun: !!o.dryRun };
}
