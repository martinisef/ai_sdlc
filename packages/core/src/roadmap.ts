// Roadmaps: a technical plan broken into epics and stories (changes/_roadmaps/<slug>/roadmap.md), drafted by an
// agent, approved by a person, then created in the tracker by `applyRoadmap`. Each story later enters the loop
// with `/sdlc-intent <KEY>`. The file is the source of the breakdown; the tracker gets copies.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { listChanges } from './changes.ts';
import { localeOf, type LoadedConfig } from './config.ts';
import { recordEvent } from './events.ts';
import { parseFrontmatter, setFrontmatter } from './frontmatter.ts';
import { gitOrThrow, git, gitUser } from './git.ts';
import { isAgent, personMatches, type Approver } from './gates.ts';
import { SdlcError } from './http.ts';
import type { Tracker } from './tracker.ts';

export const ROADMAPS_DIR = 'changes/_roadmaps';
export const ROADMAP_RISKS = ['low', 'medium', 'high'] as const;
/** Fields an item may declare as `- name: value` lines right under its heading. */
export const ITEM_FIELDS = ['risk', 'depends', 'source', 'labels', 'key', 'links'] as const;
/** Above this many acceptance criteria a story is probably more than one change. */
export const MAX_CRITERIA = 8;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
export const SOURCE_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt'];
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export interface RoadmapItem {
  id: string;
  kind: 'epic' | 'story';
  title: string;
  /** Epic id, for stories. */
  epic?: string;
  fields: Partial<Record<(typeof ITEM_FIELDS)[number], string>>;
  /** Free text under the heading, without the field lines. */
  description: string;
  criteria: string[];
  depends: string[];
  /** 1-based line of the heading. */
  line: number;
}

export interface RoadmapQuestion {
  id: string;
  text: string;
  answer?: string;
}

export interface Roadmap {
  slug: string;
  path: string;
  data: Record<string, string>;
  title: string;
  items: RoadmapItem[];
  questions: RoadmapQuestion[];
  raw: string;
}

const HEADING = /^(#{2,3})\s+(E\d+(?:\.S\d+)?)\s*[·:—–-]\s*(.+?)\s*$/;
const QUESTIONS = /^##\s+(Open questions|Preguntas abiertas)\s*$/i;
const FIELD = /^-\s+([a-z_]+):\s*(.*)$/;
const CRITERION = /^\s*-\s+\[[ xX]\]\s+(.+)$/;
const QUESTION = /^-\s+(Q\d+):\s*(.+)$/;
const ANSWER = /^\s+(?:A|R):\s*(.*)$/;

export const roadmapPath = (slug: string) => `${ROADMAPS_DIR}/${slug}/roadmap.md`;

export function parseRoadmap(raw: string, slug = '', path = roadmapPath(slug)): Roadmap {
  const { data, body, hasFrontmatter } = parseFrontmatter(raw);
  const offset = hasFrontmatter ? raw.split('\n').length - body.split('\n').length : 0;
  const lines = body.split('\n');
  const items: RoadmapItem[] = [];
  const questions: RoadmapQuestion[] = [];
  let current: RoadmapItem | undefined;
  let inFields = false;
  let inQuestions = false;
  let epic: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = HEADING.exec(line);
    if (h) {
      const kind = h[2].includes('.') ? 'story' : 'epic';
      if (kind === 'epic') epic = h[2];
      current = { id: h[2], kind, title: h[3], epic: kind === 'story' ? epic : undefined, fields: {}, description: '', criteria: [], depends: [], line: offset + i + 1 };
      items.push(current);
      inFields = true;
      inQuestions = false;
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      current = undefined;
      inQuestions = QUESTIONS.test(line);
      continue;
    }
    if (inQuestions) {
      const q = QUESTION.exec(line);
      if (q) questions.push({ id: q[1], text: q[2].trim() });
      const a = ANSWER.exec(line);
      if (a && questions.length && a[1].trim()) questions[questions.length - 1].answer = a[1].trim();
      continue;
    }
    if (!current) continue;
    const f = FIELD.exec(line);
    if (inFields && f && (ITEM_FIELDS as readonly string[]).includes(f[1])) {
      current.fields[f[1] as (typeof ITEM_FIELDS)[number]] = f[2].trim();
      continue;
    }
    if (line.trim()) inFields = false;
    const c = CRITERION.exec(line);
    if (c) current.criteria.push(c[1].trim());
    else current.description += `${line}\n`;
  }
  for (const it of items) {
    it.description = it.description.replace(/^(Acceptance criteria|Criterios de aceptación):?\s*$/gim, '').trim();
    it.depends = (it.fields.depends ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== '-');
  }
  const title = body.match(/^#\s+(?:[^:\n]+:\s*)?(.+)$/m)?.[1]?.trim() ?? slug;
  return { slug, path, data, title, items, questions, raw };
}

export interface RoadmapCheck {
  errors: string[];
  warnings: string[];
  epics: number;
  stories: number;
  open: number;
}

export function checkRoadmap(r: Roadmap): RoadmapCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const at = (it: RoadmapItem) => `${it.id} (line ${it.line})`;
  for (const it of r.items) {
    if (ids.has(it.id)) errors.push(`${at(it)}: duplicate id`);
    ids.add(it.id);
  }
  const epics = r.items.filter((i) => i.kind === 'epic');
  const stories = r.items.filter((i) => i.kind === 'story');
  if (!epics.length) errors.push('no epics: add `## E1 · <title>` headings');
  for (const e of epics) if (!stories.some((s) => s.epic === e.id)) warnings.push(`${at(e)}: epic without stories`);
  for (const s of stories) {
    if (!s.epic || !s.id.startsWith(`${s.epic}.`)) errors.push(`${at(s)}: story is not under its epic (${s.id.split('.')[0]})`);
    if (s.fields.risk && !(ROADMAP_RISKS as readonly string[]).includes(s.fields.risk)) errors.push(`${at(s)}: risk must be low, medium or high`);
    if (!s.criteria.length) errors.push(`${at(s)}: no acceptance criteria (\`- [ ] …\` lines)`);
    else if (s.criteria.length > MAX_CRITERIA) warnings.push(`${at(s)}: ${s.criteria.length} acceptance criteria; probably more than one change, consider splitting it`);
    for (const d of s.depends) if (!ids.has(d)) errors.push(`${at(s)}: depends on ${d}, which does not exist`);
  }
  const cycle = findCycle(stories);
  if (cycle) errors.push(`dependency cycle: ${cycle.join(' → ')}`);
  const open = r.questions.filter((q) => !q.answer);
  for (const q of open) errors.push(`${q.id} has no answer: ${q.text}`);
  return { errors, warnings, epics: epics.length, stories: stories.length, open: open.length };
}

function findCycle(stories: RoadmapItem[]): string[] | undefined {
  const deps = new Map(stories.map((s) => [s.id, s.depends]));
  const state = new Map<string, 'visiting' | 'done'>();
  const walk = (id: string, path: string[]): string[] | undefined => {
    if (state.get(id) === 'done') return undefined;
    if (state.get(id) === 'visiting') return [...path.slice(path.indexOf(id)), id];
    state.set(id, 'visiting');
    for (const d of deps.get(id) ?? []) {
      const c = walk(d, [...path, id]);
      if (c) return c;
    }
    state.set(id, 'done');
    return undefined;
  };
  for (const s of stories) {
    const c = walk(s.id, []);
    if (c) return c;
  }
  return undefined;
}

/** Fingerprint of what people approved: the body without the fields only `apply` writes. */
export function roadmapHash(raw: string): string {
  const { body } = parseFrontmatter(raw);
  const normalized = body
    .split('\n')
    .filter((l) => !/^-\s+(key|links):/.test(l))
    .join('\n')
    .trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/** Set `- name: value` on an item, under its heading (after the fields it already has). */
export function setItemField(raw: string, id: string, name: (typeof ITEM_FIELDS)[number], value: string): string {
  const lines = raw.split('\n');
  const start = lines.findIndex((l) => HEADING.exec(l)?.[2] === id);
  if (start === -1) throw new SdlcError(`no item ${id} in the roadmap`);
  let i = start + 1;
  for (; i < lines.length; i++) {
    const f = FIELD.exec(lines[i]);
    if (!f || !(ITEM_FIELDS as readonly string[]).includes(f[1])) break;
    if (f[1] === name) {
      lines[i] = `- ${name}: ${value}`;
      return lines.join('\n');
    }
  }
  lines.splice(i, 0, `- ${name}: ${value}`);
  return lines.join('\n');
}

/** Write answers (question id → text) into the Open questions section. */
export function setAnswers(raw: string, answers: Record<string, string>): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let inQuestions = false;
  let pending: string | undefined;
  const flush = () => {
    if (pending && answers[pending]?.trim()) out.push(`  A: ${answers[pending].trim().replace(/\n+/g, ' ')}`);
    pending = undefined;
  };
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      flush();
      inQuestions = QUESTIONS.test(line);
      out.push(line);
      continue;
    }
    if (inQuestions) {
      const q = QUESTION.exec(line);
      if (q) {
        flush();
        out.push(line);
        pending = q[1];
        continue;
      }
      if (ANSWER.test(line) && pending && answers[pending]?.trim()) continue;
      if (ANSWER.test(line) && pending) {
        out.push(line);
        pending = undefined;
        continue;
      }
      if (!line.trim()) flush();
    }
    out.push(line);
  }
  flush();
  return out.join('\n');
}

export function roadmapTemplate(o: { slug: string; title: string; author?: string; source?: string; locale?: 'en' | 'es' }): string {
  const es = o.locale === 'es';
  return `---
roadmap: ${o.slug}
status: draft            # draft → approved | rejected (sdlc roadmap approve)
author: ${o.author ?? ''}
source: ${o.source ?? ''}
created: ${new Date().toISOString().slice(0, 10)}
---
# Roadmap: ${o.title}

${es ? '<!-- Resumen: objetivo del plan técnico, alcance y lo que queda afuera. -->' : '<!-- Summary: the goal of the technical plan, what is in scope and what is not. -->'}

## E1 · ${es ? '<título de la épica>' : '<epic title>'}

${es ? '<!-- Qué entrega esta épica. -->' : '<!-- What this epic delivers. -->'}

### E1.S1 · ${es ? '<título de la historia>' : '<story title>'}
- risk: low
- depends: -
- source: ${es ? '§<sección del documento>' : '§<section of the document>'}

${es ? '<!-- Qué y por qué, en dos o tres líneas. -->' : '<!-- What and why, in two or three lines. -->'}

${es ? 'Criterios de aceptación:' : 'Acceptance criteria:'}
- [ ] ${es ? '<comportamiento observable>' : '<observable behaviour>'}

## ${es ? 'Preguntas abiertas' : 'Open questions'}
- Q1: ${es ? '<lo que el documento no aclara>' : '<what the document leaves unclear>'}
  A:
`;
}

export function listRoadmaps(root: string): Roadmap[] {
  const dir = join(root, ROADMAPS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'roadmap.md')))
    .sort()
    .map((d) => parseRoadmap(readFileSync(join(dir, d, 'roadmap.md'), 'utf8'), d));
}

export function getRoadmap(root: string, slug: string): Roadmap {
  const s = slug.replace(/^changes\/_roadmaps\//, '').replace(/\/(roadmap\.md)?$/, '');
  if (!SLUG.test(s)) throw new SdlcError(`invalid roadmap '${slug}': lowercase letters, digits and dashes`);
  const p = join(root, roadmapPath(s));
  if (!existsSync(p)) throw new SdlcError(`roadmap not found: ${roadmapPath(s)} (create it with: sdlc roadmap new ${s} --source <file|url>)`);
  return parseRoadmap(readFileSync(p, 'utf8'), s);
}

/** Scaffold the folder: copy the source document (or keep its URL) and write the template. Does not commit. */
export function newRoadmap(root: string, slug: string, o: { source?: string; title?: string; loaded?: LoadedConfig; author?: string } = {}): { path: string; source?: string } {
  if (!SLUG.test(slug)) throw new SdlcError(`invalid slug '${slug}': lowercase letters, digits and dashes`);
  const dir = join(root, ROADMAPS_DIR, slug);
  if (existsSync(join(dir, 'roadmap.md'))) throw new SdlcError(`${roadmapPath(slug)} already exists`);
  mkdirSync(dir, { recursive: true });
  let source = o.source;
  if (o.source && !/^https?:\/\//.test(o.source)) {
    const ext = extname(o.source).toLowerCase();
    if (!SOURCE_EXTENSIONS.includes(ext)) throw new SdlcError(`unsupported source ${basename(o.source)}: use ${SOURCE_EXTENSIONS.join(', ')} (export Word or Google Docs to PDF)`);
    if (!existsSync(o.source)) throw new SdlcError(`source not found: ${o.source}`);
    if (statSync(o.source).size > MAX_SOURCE_BYTES) throw new SdlcError(`source is larger than ${MAX_SOURCE_BYTES / 1024 / 1024} MB`);
    copyFileSync(o.source, join(dir, `source${ext}`));
    source = `${ROADMAPS_DIR}/${slug}/source${ext}`;
    // agents without a PDF reader (Codex, some Cursor models) read the text beside it; without pdftotext they convert it
    if (ext === '.pdf') spawnSync('pdftotext', ['-layout', join(dir, 'source.pdf'), join(dir, 'source.txt')], { stdio: 'ignore' });
  }
  const title = o.title ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  writeFileSync(join(dir, 'roadmap.md'), roadmapTemplate({ slug, title, author: o.author ?? gitUser(root).name, source, locale: localeOf(o.loaded) }));
  recordEvent(root, { type: 'roadmap.new', change: `${ROADMAPS_DIR}/${slug}`, detail: source });
  return { path: roadmapPath(slug), source };
}

export interface RoadmapDecision {
  slug: string;
  decision: 'approved' | 'rejected';
  by: string;
  commit: string;
}

export function canDecideRoadmap(who: Approver, loaded: LoadedConfig | undefined): { ok: boolean; reason?: string } {
  const id = `${who.name ?? ''} <${who.email ?? ''}>${who.login ? ` @${who.login}` : ''}`;
  if (!who.email && !who.name && !who.login) return { ok: false, reason: 'git user.name / user.email is not set' };
  if (isAgent(who)) return { ok: false, reason: `${id} looks like an agent or bot; a person must approve` };
  const roles = loaded?.config.gates?.roadmap ?? [];
  const people = [...new Set(roles.flatMap((r) => loaded?.config.roles?.[r] ?? []))];
  if (!roles.length || !people.length || personMatches(people, who)) return { ok: true };
  return { ok: false, reason: `roadmap needs approval from: ${roles.join(', ')}` };
}

/** Approve or reject: a commit on the current branch, like the other gates. Approving needs a roadmap that passes the check. */
export function decideRoadmap(
  root: string,
  loaded: LoadedConfig | undefined,
  slug: string,
  decision: 'approved' | 'rejected',
  o: { approver?: Approver; comment?: string } = {},
): RoadmapDecision {
  const r = getRoadmap(root, slug);
  const who: Approver = o.approver ?? gitUser(root);
  const can = canDecideRoadmap(who, loaded);
  if (!can.ok) throw new SdlcError(can.reason!);
  if (decision === 'approved') {
    const c = checkRoadmap(r);
    if (c.errors.length) throw new SdlcError(`the roadmap does not pass the check; fix it first:\n${c.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  const by = who.name ?? who.email ?? `@${who.login}`;
  const fields: Record<string, string> = { status: decision };
  if (decision === 'approved') {
    fields.approved_by = by;
    fields.approved_at = new Date().toISOString().slice(0, 10);
    fields.approved_hash = roadmapHash(r.raw);
  }
  writeFileSync(join(root, r.path), setFrontmatter(r.raw, fields));
  const dir = `${ROADMAPS_DIR}/${r.slug}`;
  const verb = decision === 'approved' ? 'approve' : 'reject';
  const msg = [`chore(roadmap-${r.slug}): ${verb} roadmap`, '', ...(o.comment ? [o.comment, ''] : []), `Gate: roadmap ${decision} by ${by}${who.email ? ` <${who.email}>` : ''}`].join('\n');
  gitOrThrow(root, ['add', '--', dir]);
  gitOrThrow(root, ['commit', '-m', msg, '--', dir]);
  recordEvent(root, { type: decision === 'approved' ? 'gate.approve' : 'gate.reject', change: dir, artifact: 'roadmap', by, detail: o.comment });
  return { slug: r.slug, decision, by, commit: gitOrThrow(root, ['rev-parse', '--short', 'HEAD']) };
}

/** Approved, and nothing but keys changed since: anything else needs a new approval. */
export function approvalHolds(r: Roadmap): { ok: boolean; reason?: string } {
  if (r.data.status !== 'approved') return { ok: false, reason: `${r.path} is ${r.data.status || 'draft'}; a person approves it first (sdlc roadmap approve ${r.slug})` };
  if (r.data.approved_hash && r.data.approved_hash !== roadmapHash(r.raw))
    return { ok: false, reason: `${r.path} changed after it was approved; approve it again (sdlc roadmap approve ${r.slug})` };
  return { ok: true };
}

export interface ApplyAction {
  id: string;
  kind: 'create-epic' | 'create-story' | 'link';
  summary: string;
  key?: string;
  parent?: string;
  blocker?: string;
}

export interface ApplyResult {
  actions: ApplyAction[];
  created: number;
  linked: number;
  dryRun: boolean;
  commit?: string;
}

/** Text of the ticket for an item: description, acceptance criteria and where it comes from. */
export function ticketBody(r: Roadmap, it: RoadmapItem, locale: 'en' | 'es' = 'en'): string {
  const es = locale === 'es';
  const parts = [it.description];
  if (it.criteria.length) parts.push(`${es ? 'Criterios de aceptación' : 'Acceptance criteria'}:\n${it.criteria.map((c) => `- ${c}`).join('\n')}`);
  const origin = [`${es ? 'Roadmap' : 'Roadmap'}: ${r.path} (${it.id})`];
  if (it.fields.source) origin.push(`${es ? 'Fuente' : 'Source'}: ${it.fields.source}${r.data.source ? ` · ${r.data.source}` : ''}`);
  if (it.fields.risk) origin.push(`${es ? 'Riesgo' : 'Risk'}: ${it.fields.risk}`);
  parts.push(origin.join('\n'));
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Create what is missing in the tracker: epics, then stories under them, then the "blocks" links. Idempotent: items
 * with a key and links already listed are skipped. Keys are written to the file as they are created and committed at
 * the end, also when a call fails halfway, so a rerun picks up where it stopped.
 */
export async function applyRoadmap(
  root: string,
  loaded: LoadedConfig | undefined,
  slug: string,
  o: { dryRun?: boolean; tracker?: () => Tracker } = {},
): Promise<ApplyResult> {
  let r = getRoadmap(root, slug);
  const holds = approvalHolds(r);
  if (!holds.ok) throw new SdlcError(holds.reason!);
  const c = checkRoadmap(r);
  if (c.errors.length) throw new SdlcError(`the roadmap does not pass the check:\n${c.errors.map((e) => `  - ${e}`).join('\n')}`);
  const locale = localeOf(loaded);
  const cfg = loaded?.config.tracker;
  const keyOf = (id: string) => r.items.find((i) => i.id === id)?.fields.key;
  const actions: ApplyAction[] = [];
  for (const it of r.items) {
    if (it.fields.key) continue;
    actions.push({ id: it.id, kind: it.kind === 'epic' ? 'create-epic' : 'create-story', summary: it.title, parent: it.epic });
  }
  for (const s of r.items.filter((i) => i.kind === 'story')) {
    const done = (s.fields.links ?? '').split(',').map((x) => x.trim());
    for (const d of s.depends) if (!done.includes(d)) actions.push({ id: s.id, kind: 'link', summary: `${d} blocks ${s.id}`, blocker: d });
  }
  if (o.dryRun) return { actions, created: 0, linked: 0, dryRun: true };
  if (!actions.length) return { actions, created: 0, linked: 0, dryRun: false };
  if (!o.tracker) throw new SdlcError('tracker not configured');
  const t = o.tracker();
  let raw = r.raw;
  let created = 0;
  let linked = 0;
  const save = (next: string) => {
    raw = next;
    writeFileSync(join(root, r.path), raw);
    r = parseRoadmap(raw, r.slug);
  };
  let failure: unknown;
  try {
    for (const a of actions) {
      const it = r.items.find((i) => i.id === a.id)!;
      if (a.kind === 'link') {
        const blocker = keyOf(a.blocker!);
        if (!blocker || !it.fields.key) continue;
        await t.link(blocker, it.fields.key);
        const done = (it.fields.links ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        save(setItemField(raw, it.id, 'links', [...done, a.blocker!].join(', ')));
        a.key = it.fields.key;
        linked++;
        continue;
      }
      const labels = (it.fields.labels ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const parent = a.kind === 'create-story' ? keyOf(it.epic!) : undefined;
      const key = await t.create({
        summary: it.title,
        body: ticketBody(r, it, locale),
        type: a.kind === 'create-epic' ? (cfg?.epic_issue_type ?? (t.provider === 'jira' ? 'Epic' : 'epic')) : cfg?.default_issue_type,
        parent,
        labels: a.kind === 'create-epic' && t.provider === 'github' ? [...labels, 'epic'] : labels,
      });
      save(setItemField(raw, it.id, 'key', key));
      a.key = key;
      a.parent = parent;
      created++;
    }
  } catch (e) {
    failure = e;
  }
  let commit: string | undefined;
  if (created || linked) {
    const dir = `${ROADMAPS_DIR}/${r.slug}`;
    const msg = `chore(roadmap-${r.slug}): ${created} tickets created, ${linked} links${failure ? ' (partial)' : ''}`;
    gitOrThrow(root, ['add', '--', dir]);
    if (git(root, ['diff', '--cached', '--quiet', '--', dir]) === undefined) {
      gitOrThrow(root, ['commit', '-m', msg, '--', dir]);
      commit = gitOrThrow(root, ['rev-parse', '--short', 'HEAD']);
    }
    recordEvent(root, { type: 'roadmap.apply', change: dir, detail: `${created} created, ${linked} linked${failure ? ', partial' : ''}` });
  }
  if (failure) {
    const msg = (failure as Error).message;
    throw new SdlcError(`${msg}\n${created} tickets and ${linked} links were created and saved in ${r.path}; run apply again to continue`);
  }
  return { actions, created, linked, dryRun: false, commit };
}

export interface StoryStatus {
  roadmap: string;
  id: string;
  title: string;
  key?: string;
  /** The change for this story's ticket, and its stage. */
  change?: string;
  stage?: string;
  /** Dependencies whose change is not merged yet. */
  blockedBy: string[];
}

/** Every story of every roadmap with its ticket, its change (matched by ticket) and what still blocks it. */
export function roadmapStatus(root: string, loaded: LoadedConfig | undefined, slug?: string): StoryStatus[] {
  const changes = listChanges(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch });
  const byTicket = new Map(changes.filter((c) => c.ticket).map((c) => [c.ticket!, c]));
  const out: StoryStatus[] = [];
  for (const r of slug ? [getRoadmap(root, slug)] : listRoadmaps(root)) {
    const stories = r.items.filter((i) => i.kind === 'story');
    const merged = (id: string) => {
      const k = stories.find((s) => s.id === id)?.fields.key;
      return !!k && byTicket.get(k)?.stage === 'merged';
    };
    for (const s of stories) {
      const ch = s.fields.key ? byTicket.get(s.fields.key) : undefined;
      out.push({ roadmap: r.slug, id: s.id, title: s.title, key: s.fields.key, change: ch?.id, stage: ch?.stage, blockedBy: s.depends.filter((d) => !merged(d)) });
    }
  }
  return out;
}

/** The next story to start: approved roadmap, has a ticket, no change yet, nothing blocking it. */
export function nextStory(root: string, loaded: LoadedConfig | undefined): StoryStatus | undefined {
  const approved = new Set(listRoadmaps(root).filter((r) => r.data.status === 'approved').map((r) => r.slug));
  if (!approved.size) return undefined;
  return roadmapStatus(root, loaded).find((s) => approved.has(s.roadmap) && s.key && !s.change && !s.blockedBy.length);
}

/** The roadmap item behind a ticket key, for `/sdlc-intent KEY`. */
export function findRoadmapItem(root: string, key: string): { roadmap: Roadmap; item: RoadmapItem } | undefined {
  for (const r of listRoadmaps(root)) {
    const item = r.items.find((i) => i.fields.key?.toLowerCase() === key.toLowerCase());
    if (item) return { roadmap: r, item };
  }
  return undefined;
}
