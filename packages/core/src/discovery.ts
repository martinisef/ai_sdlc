// Discovery (experimental): project state kept from meeting transcripts, in changes/_discovery/. Topics are Markdown
// tables with a closed vocabulary in English or Spanish; the agent extracts and merges, this module checks the result,
// writes STATUS.md and the follow-up drafts. Nothing here talks to the tracker: the tracker is only read (tracker.search).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { localeOf, type LoadedConfig } from './config.ts';
import { parseFrontmatter } from './frontmatter.ts';
import { git, lines } from './git.ts';
import { SdlcError } from './http.ts';
import { trackerKeys } from './tracker.ts';

export type DiscoveryLocale = 'en' | 'es';
type Names = Record<DiscoveryLocale, string>;
const S = (en: string, es = en): Names => ({ en, es });

export const DISCOVERY_DIR = 'changes/_discovery';
/** Written by `sdlc discovery seed`: what the project already has before the first meeting. */
export const BASELINE_TOPIC = '_baseline';
/** Items the agent could not place in a topic yet. */
export const UNSORTED_TOPIC = '_unsorted';
export const TRANSCRIPT_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt', '.vtt', '.srt'];
const MAX_TRANSCRIPT_BYTES = 20 * 1024 * 1024;

export const TABLE_KEYS = ['features', 'actions', 'decisions', 'questions', 'risks'] as const;
export type TableKey = (typeof TABLE_KEYS)[number];

export const STATUSES = {
  features: {
    requested: S('requested', 'pedido'),
    in_progress: S('in progress', 'en curso'),
    done: S('done', 'hecho'),
    reimplement: S('reimplement', 'reimplementar'),
    out_of_scope: S('out of scope', 'fuera de alcance'),
    dropped: S('dropped', 'descartado'),
  },
  actions: {
    open: S('open', 'abierto'),
    scheduled: S('scheduled', 'agendado'),
    verify: S('verify', 'verificar'),
    done: S('done', 'hecho'),
    cancelled: S('cancelled', 'cancelado'),
  },
  /** `superseded` is written with the decision that replaces it: `superseded by D3`. */
  decisions: { active: S('active', 'vigente'), superseded: S('superseded by', 'reemplazada por') },
  questions: {
    open: S('open', 'abierta'),
    contradiction: S('contradiction', 'contradicción'),
    answered: S('answered', 'respondida'),
    dropped: S('dropped', 'descartada'),
  },
  risks: { active: S('active', 'activo'), mitigated: S('mitigated', 'mitigado'), happened: S('happened', 'ocurrido') },
} as const satisfies Record<TableKey, Record<string, Names>>;

export const REPO_STATES = { missing: S('missing', 'no existe'), partial: S('partial', 'parcial'), exists: S('exists', 'ya existe'), unverified: S('not verified', 'no verificado') };
export const SOURCE_TYPES = { client: S('client', 'cliente'), review: S('review'), daily: S('daily'), internal: S('internal', 'interna'), other: S('other', 'otra') };
export type SourceType = keyof typeof SOURCE_TYPES;
const NO_TICKET = S('no ticket', 'sin ticket');
const PARTIES = { team: S('Team', 'Equipo'), client: S('Client', 'Cliente') };
const REASON = S('reason', 'motivo');
const CHANGES = S('Changes', 'Cambios');
const SOURCES_TITLE = S('Sources', 'Fuentes');
const OPEN_FEATURES = ['requested', 'in_progress', 'reimplement'];

const COL = { id: S('ID'), status: S('Status', 'Estado'), evidence: S('Evidence', 'Evidencia') };
const TABLES: Record<TableKey, { prefix: string; title: Names; columns: [string, Names][] }> = {
  features: {
    prefix: 'F',
    title: S('Features'),
    columns: [['id', COL.id], ['text', S('Feature')], ['status', COL.status], ['repo', S('Repo')], ['ticket', S('Ticket')], ['blocked_by', S('Blocked by', 'Bloqueado por')], ['evidence', COL.evidence]],
  },
  actions: {
    prefix: 'A',
    title: S('Action items', 'Accionables'),
    columns: [['id', COL.id], ['text', S('Action', 'Accionable')], ['owner', S('Owner', 'Responsable')], ['status', COL.status], ['evidence', COL.evidence]],
  },
  decisions: { prefix: 'D', title: S('Decisions', 'Decisiones'), columns: [['id', COL.id], ['text', S('Decision', 'Decisión')], ['status', COL.status], ['evidence', COL.evidence]] },
  questions: {
    prefix: 'Q',
    title: S('Questions', 'Preguntas'),
    columns: [['id', COL.id], ['text', S('Question', 'Pregunta')], ['to', S('To', 'Para')], ['status', COL.status], ['since', S('Since', 'Desde')], ['answer', S('Answer', 'Respuesta')], ['evidence', COL.evidence]],
  },
  risks: { prefix: 'R', title: S('Risks', 'Riesgos'), columns: [['id', COL.id], ['text', S('Risk', 'Riesgo')], ['status', COL.status], ['evidence', COL.evidence]] },
};
const SOURCE_COLUMNS: [keyof Omit<Source, 'label' | 'line'>, Names][] = [['date', S('Date', 'Fecha')], ['name', S('Source', 'Fuente')], ['type', S('Type', 'Tipo')], ['file', S('File', 'Archivo')], ['sha', S('SHA-256')]];

/** Lowercase, no accents, single spaces: `Contradicción` and `contradiccion` are the same status. */
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const matches = (value: string, n: Names) => norm(value) === norm(n.en) || norm(value) === norm(n.es);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(s));
const EMPTY = /^(|-|—|–)$/;
const SLUG = /^_?[a-z0-9][a-z0-9-]*$/;

export interface Row {
  table: TableKey;
  topic: string;
  id: string;
  /** Canonical column key → cell text. */
  cells: Record<string, string>;
  /** Canonical status key, undefined when the cell is not in the closed list. */
  status?: string;
  line: number;
}

export interface Topic {
  slug: string;
  path: string;
  title: string;
  data: Record<string, string>;
  rows: Row[];
  changes: { text: string; line: number }[];
  /** Format problems found while parsing (unknown columns, broken rows). */
  problems: string[];
}

export interface Source {
  date: string;
  name: string;
  type: string;
  file: string;
  sha: string;
  /** `<date> <name>`: how evidence cites it. */
  label: string;
  line: number;
}

export interface Discovery {
  dir: string;
  locale: DiscoveryLocale;
  topics: Topic[];
  sources: Source[];
  problems: string[];
}

export const discoveryDir = (loaded: LoadedConfig | undefined) => (loaded?.config.discovery?.dir ?? DISCOVERY_DIR).replace(/\/+$/, '');
const topicPath = (dir: string, slug: string) => `${dir}/topics/${slug}.md`;

function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
}
const escapeCell = (s: string) => s.replace(/\r?\n/g, '<br>').replace(/(?<!\\)\|/g, '\\|');
const tableLine = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`;
const isSeparator = (line: string) => /^\|[\s:|-]+\|?$/.test(line.trim());

function tableOf(heading: string): TableKey | 'changes' | undefined {
  if (matches(heading, CHANGES)) return 'changes';
  return TABLE_KEYS.find((k) => matches(heading, TABLES[k].title));
}

/** Lines outside HTML comments, with their 1-based line numbers. */
function visibleLines(raw: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let inComment = false;
  raw.split('\n').forEach((text, i) => {
    let t = text;
    if (inComment) {
      const end = t.indexOf('-->');
      if (end === -1) return;
      t = t.slice(end + 3);
      inComment = false;
    }
    t = t.replace(/<!--.*?-->/g, '');
    const start = t.indexOf('<!--');
    if (start !== -1) {
      t = t.slice(0, start);
      inComment = true;
    }
    out.push({ text: t, line: i + 1 });
  });
  return out;
}

export function parseTopic(raw: string, slug: string, path = topicPath(DISCOVERY_DIR, slug)): Topic {
  const { data } = parseFrontmatter(raw);
  const topic: Topic = { slug, path, title: data.title || slug, data, rows: [], changes: [], problems: [] };
  let section: TableKey | 'changes' | undefined;
  let header: string[] | undefined;
  const fmEnd = raw.startsWith('---') ? raw.split('\n').findIndex((l, i) => i > 0 && l.trimEnd() === '---') + 1 : 0;
  for (const { text, line } of visibleLines(raw)) {
    if (line <= fmEnd) continue;
    const h = /^##\s+(.+?)\s*$/.exec(text);
    if (h) {
      section = tableOf(h[1]);
      header = undefined;
      continue;
    }
    if (!section) continue;
    if (section === 'changes') {
      if (/^\s*[-*]\s+\S/.test(text)) topic.changes.push({ text: text.trim(), line });
      continue;
    }
    if (!text.trim().startsWith('|')) continue;
    const def = TABLES[section];
    const cells = splitCells(text);
    if (!header) {
      header = cells.map((c) => def.columns.find(([, n]) => matches(c, n))?.[0] ?? '');
      cells.forEach((c, i) => header![i] || topic.problems.push(`${path}:${line}: unknown column '${c}' in ${def.title.en} (columns: ${def.columns.map(([, n]) => n.en).join(', ')})`));
      for (const [k, n] of def.columns) if (!header.includes(k)) topic.problems.push(`${path}:${line}: ${def.title.en} is missing the column '${n.en}'`);
      continue;
    }
    if (isSeparator(text)) continue;
    if (cells.length !== header.length) topic.problems.push(`${path}:${line}: the row has ${cells.length} cells, the header ${header.length}`);
    const byKey: Record<string, string> = {};
    header.forEach((k, i) => k && (byKey[k] = cells[i] ?? ''));
    topic.rows.push({ table: section, topic: slug, id: byKey.id ?? '', cells: byKey, status: statusKey(section, byKey.status ?? ''), line });
  }
  return topic;
}

export function statusKey(table: TableKey, value: string): string | undefined {
  for (const [k, n] of Object.entries(STATUSES[table]) as [string, Names][]) {
    if (table === 'decisions' && k === 'superseded') {
      const m = /^(.*?)\s+(D\d+)$/i.exec(value.trim());
      if (m && matches(m[1], n)) return k;
    } else if (matches(value, n)) return k;
  }
  return undefined;
}

export function statusLabel(table: TableKey, key: string, locale: DiscoveryLocale): string {
  return (STATUSES[table] as Record<string, Names>)[key]?.[locale] ?? key;
}

export const repoKey = (value: string) => (Object.keys(REPO_STATES) as (keyof typeof REPO_STATES)[]).find((k) => matches(value, REPO_STATES[k]));

export interface TicketCell {
  none: boolean;
  unverified: boolean;
  /** `~KEY` is a likely match nobody confirmed yet. */
  keys: { key: string; confirmed: boolean }[];
  invalid: string[];
}

const TICKET = /^(~)?((?:[\w.-]+\/[\w.-]+)?#\d+|[A-Za-z][A-Za-z0-9_]*-\d+)$/;
export function parseTickets(cell: string): TicketCell {
  const out: TicketCell = { none: false, unverified: false, keys: [], invalid: [] };
  for (const part of cell.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = TICKET.exec(part);
    if (m) out.keys.push({ key: m[2], confirmed: !m[1] });
    else if (matches(part, NO_TICKET)) out.none = true;
    else if (matches(part, REPO_STATES.unverified)) out.unverified = true;
    else out.invalid.push(part);
  }
  return out;
}

/** `Team: Ana` / `Cliente: Pedro, Laura` → the side and the names. */
export function parseParty(cell: string): { party: 'team' | 'client'; names: string[] } | undefined {
  const m = /^([^:]+):\s*(.+)$/.exec(cell.trim());
  if (!m) return undefined;
  const party = (Object.keys(PARTIES) as ('team' | 'client')[]).find((k) => matches(m[1], PARTIES[k]));
  if (!party) return undefined;
  return { party, names: m[2].split(/,|\/|\s+(?:and|y)\s+/).map((s) => s.trim()).filter(Boolean) };
}

export const evidencePieces = (cell: string) => cell.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
/** The source label a piece of evidence cites: everything before the first ` · `. */
export const evidenceSource = (piece: string) => piece.split(' · ')[0].trim();
const hasReason = (cell: string) => evidencePieces(cell).some((p) => p.split(' · ').some((seg) => matches(seg.split(':')[0], REASON) && seg.includes(':')));

function blockedRefs(cell: string, topic: string): string[] {
  if (EMPTY.test(cell.trim())) return [];
  return cell.split(',').map((s) => s.trim()).filter(Boolean).map((r) => (r.includes('#') ? r : `${topic}#${r}`));
}

export function parseSources(raw: string, path = `${DISCOVERY_DIR}/_sources.md`): { sources: Source[]; problems: string[] } {
  const sources: Source[] = [];
  const problems: string[] = [];
  let header: string[] | undefined;
  for (const { text, line } of visibleLines(raw)) {
    if (!text.trim().startsWith('|')) continue;
    const cells = splitCells(text);
    if (!header) {
      header = cells.map((c) => SOURCE_COLUMNS.find(([, n]) => matches(c, n))?.[0] ?? '');
      for (const [k, n] of SOURCE_COLUMNS) if (!header.includes(k)) problems.push(`${path}:${line}: missing the column '${n.en}'`);
      continue;
    }
    if (isSeparator(text)) continue;
    const r: Record<string, string> = {};
    header.forEach((k, i) => k && (r[k] = cells[i] ?? ''));
    sources.push({ date: r.date ?? '', name: r.name ?? '', type: r.type ?? '', file: r.file ?? '', sha: (r.sha ?? '').toLowerCase(), label: `${r.date} ${r.name}`.trim(), line });
  }
  return { sources, problems };
}

export function sourcesTemplate(locale: DiscoveryLocale): string {
  const intro =
    locale === 'es'
      ? '<!-- Una fila por reunión procesada, en orden de fecha. La escribe `sdlc discovery add`; la evidencia de los topics cita "Fecha Fuente". -->'
      : '<!-- One row per processed meeting, in date order. Written by `sdlc discovery add`; topic evidence cites "Date Source". -->';
  return `# ${SOURCES_TITLE[locale]}\n\n${intro}\n\n${tableLine(SOURCE_COLUMNS.map(([, n]) => n[locale]))}\n|${SOURCE_COLUMNS.map(() => '---').join('|')}|\n`;
}

/** A topic file with its five empty tables and the Changes log, in the project locale. */
export function topicTemplate(o: { slug: string; title: string; created: string; locale: DiscoveryLocale; intro?: string }): string {
  const l = o.locale;
  const tables = TABLE_KEYS.map((k) => {
    const cols = TABLES[k].columns.map(([, n]) => n[l]);
    return `## ${TABLES[k].title[l]}\n${tableLine(cols)}\n|${cols.map(() => '---').join('|')}|\n`;
  });
  const log = l === 'es' ? '<!-- Solo se agrega: `- <fuente>: qué cambió (F2 nueva, Q1 respondida)` -->' : '<!-- Append only: `- <source>: what changed (F2 added, Q1 answered)` -->';
  return `---\ntopic: ${o.slug}\ntitle: ${o.title}\ncreated: ${o.created}\n---\n# ${o.title}\n${o.intro ? `\n${o.intro}\n` : ''}\n${tables.join('\n')}\n## ${CHANGES[l]}\n${log}\n`;
}

export function loadDiscovery(root: string, loaded: LoadedConfig | undefined): Discovery {
  const dir = discoveryDir(loaded);
  const d: Discovery = { dir, locale: localeOf(loaded), topics: [], sources: [], problems: [] };
  const topicsDir = join(root, dir, 'topics');
  if (existsSync(topicsDir)) {
    for (const f of readdirSync(topicsDir).filter((f) => f.endsWith('.md')).sort()) {
      const slug = f.slice(0, -3);
      d.topics.push(parseTopic(readFileSync(join(topicsDir, f), 'utf8'), slug, topicPath(dir, slug)));
    }
  }
  const sourcesFile = join(root, dir, '_sources.md');
  if (existsSync(sourcesFile)) {
    const s = parseSources(readFileSync(sourcesFile, 'utf8'), `${dir}/_sources.md`);
    d.sources = s.sources;
    d.problems.push(...s.problems);
  }
  return d;
}

export const rowRef = (r: Row) => `${r.topic}#${r.id}`;
const allRows = (d: Discovery) => d.topics.flatMap((t) => t.rows);

/** The people on the team side: `discovery.team`, else everyone named in `roles`. */
function teamNames(loaded: LoadedConfig | undefined): { names: string[]; explicit: boolean } {
  const explicit = loaded?.config.discovery?.team;
  if (explicit?.length) return { names: explicit, explicit: true };
  return { names: Object.values(loaded?.config.roles ?? {}).flat(), explicit: false };
}

/** `Ana` matches `Ana Pérez`, `ana@acme.com` and `@ana`. */
function nameMatches(entries: string[], name: string): boolean {
  const n = norm(name);
  return entries.some((e) => {
    const x = norm(e).replace(/^@/, '');
    return x === n || x.split(' ')[0] === n || x.split('@')[0].split(/[._-]/)[0] === n || (n.includes(' ') && x.startsWith(n));
  });
}

export interface DiscoveryCheck {
  errors: string[];
  warnings: string[];
  topics: number;
  rows: number;
  sources: number;
}

/** Everything `sdlc discovery validate` enforces: the format, the closed vocabulary, the evidence and append-only history. */
export function validateDiscovery(root: string, loaded: LoadedConfig | undefined, d = loadDiscovery(root, loaded)): DiscoveryCheck {
  const errors: string[] = [...d.problems];
  const warnings: string[] = [];
  const labels = new Set(d.sources.map((s) => s.label));
  const rows = allRows(d);
  const byRef = new Map(rows.map((r) => [rowRef(r), r]));
  const team = teamNames(loaded);
  const commitTranscripts = loaded?.config.discovery?.commit_transcripts !== false;

  const seenLabels = new Set<string>();
  const seenSha = new Set<string>();
  let lastDate = '';
  for (const s of d.sources) {
    const at = `${d.dir}/_sources.md:${s.line}`;
    if (!isDate(s.date)) errors.push(`${at}: date '${s.date}' is not YYYY-MM-DD`);
    else if (s.date < lastDate) errors.push(`${at}: sources go in date order (${s.date} after ${lastDate})`);
    else lastDate = s.date;
    if (!s.name) errors.push(`${at}: the source has no name`);
    if (seenLabels.has(s.label)) errors.push(`${at}: '${s.label}' is listed twice (evidence cites it by date and name: rename one)`);
    seenLabels.add(s.label);
    if (s.sha && seenSha.has(s.sha)) errors.push(`${at}: the same file was registered twice (SHA-256 ${s.sha.slice(0, 12)}…)`);
    seenSha.add(s.sha);
    if (!Object.values(SOURCE_TYPES).some((n) => matches(s.type, n))) errors.push(`${at}: type '${s.type}' is not one of ${Object.values(SOURCE_TYPES).map((n) => n.en).join(', ')}`);
    if (commitTranscripts && s.file && !existsSync(join(root, d.dir, s.file))) warnings.push(`${at}: ${s.file} is missing`);
  }

  for (const t of d.topics) {
    errors.push(...t.problems);
    if (!SLUG.test(t.slug)) errors.push(`${t.path}: file name '${t.slug}': lowercase letters, digits and dashes`);
    if (t.data.topic !== t.slug) errors.push(`${t.path}:1: frontmatter topic is '${t.data.topic ?? ''}', the file name says '${t.slug}'`);
    if (!t.data.title) errors.push(`${t.path}:1: frontmatter needs a title`);
    const ids = new Set<string>();
    for (const r of t.rows) {
      const at = `${t.path}:${r.line}`;
      const def = TABLES[r.table];
      if (!new RegExp(`^${def.prefix}\\d+$`).test(r.id)) errors.push(`${at}: ID '${r.id}' in ${def.title.en} must be ${def.prefix}<number>`);
      else if (ids.has(r.id)) errors.push(`${at}: ${r.id} is used twice in this topic`);
      ids.add(r.id);
      if (!r.cells.text) errors.push(`${at}: ${r.id} has no text`);
      if (!r.status) errors.push(`${at}: ${r.id}: status '${r.cells.status ?? ''}' is not one of: ${Object.values(STATUSES[r.table] as Record<string, Names>).map((n) => n[d.locale]).join(', ')}`);
      const evidence = evidencePieces(r.cells.evidence ?? '');
      if (!evidence.length) errors.push(`${at}: ${r.id} has no evidence (\`<source> · speaker: "quote"\`)`);
      for (const p of evidence) {
        const src = evidenceSource(p);
        if (src !== 'seed' && !labels.has(src)) errors.push(`${at}: ${r.id} cites '${src}', which is not in _sources.md (or 'seed')`);
      }
      if (r.table === 'features') checkFeature(r, at, byRef, errors);
      if (r.table === 'actions' || r.table === 'questions') {
        const cell = r.cells[r.table === 'actions' ? 'owner' : 'to'] ?? '';
        const p = parseParty(cell);
        if (!p) errors.push(`${at}: ${r.id}: '${cell}' must start with ${PARTIES.team[d.locale]}: or ${PARTIES.client[d.locale]}:`);
        else if (team.names.length) {
          for (const n of p.names) {
            const inTeam = nameMatches(team.names, n);
            if (p.party === 'client' && inTeam) warnings.push(`${at}: ${r.id}: ${n} is on the team (discovery.team / roles), not the client`);
            if (p.party === 'team' && !inTeam && team.explicit) warnings.push(`${at}: ${r.id}: ${n} is not in discovery.team`);
          }
        }
      }
      if (r.table === 'questions') {
        if (!isDate(r.cells.since ?? '')) errors.push(`${at}: ${r.id}: Since '${r.cells.since ?? ''}' is not YYYY-MM-DD`);
        if (r.status === 'answered' && EMPTY.test((r.cells.answer ?? '').trim())) errors.push(`${at}: ${r.id} is answered but the Answer is empty`);
      }
      if (r.table === 'decisions' && r.status === 'superseded') {
        const by = /(D\d+)$/i.exec(r.cells.status ?? '')?.[1]?.toUpperCase();
        if (by && !t.rows.some((x) => x.table === 'decisions' && x.id === by)) errors.push(`${at}: ${r.id} is superseded by ${by}, which does not exist`);
      }
    }
    for (const c of t.changes) {
      const src = /^[-*]\s+(.+?):\s/.exec(c.text)?.[1];
      if (!src || (src !== 'seed' && !labels.has(src))) errors.push(`${t.path}:${c.line}: a Changes line starts with a source from _sources.md (or seed): \`- <source>: what changed\``);
    }
  }
  errors.push(...historyErrors(root, d));
  const status = join(root, d.dir, 'STATUS.md');
  if (d.topics.length && (!existsSync(status) || readFileSync(status, 'utf8') !== renderStatus(discoveryStatus(d), d.locale))) {
    warnings.push(`${d.dir}/STATUS.md is out of date: run sdlc discovery status`);
  }
  return { errors, warnings, topics: d.topics.length, rows: rows.length, sources: d.sources.length };
}

function checkFeature(r: Row, at: string, byRef: Map<string, Row>, errors: string[]) {
  if (!repoKey(r.cells.repo ?? '')) errors.push(`${at}: ${r.id}: Repo '${r.cells.repo ?? ''}' is not one of ${Object.values(REPO_STATES).map((n) => n.en).join(', ')}`);
  const tickets = parseTickets(r.cells.ticket ?? '');
  if (!tickets.keys.length && !tickets.none && !tickets.unverified) errors.push(`${at}: ${r.id}: Ticket is empty: a key, 'no ticket' or 'not verified'`);
  for (const bad of tickets.invalid) errors.push(`${at}: ${r.id}: '${bad}' is not a ticket key (KEY-12, #12, ~KEY-12 when unconfirmed)`);
  if (r.status === 'reimplement' && !hasReason(r.cells.evidence ?? '')) errors.push(`${at}: ${r.id} is reimplement: add \`reason: …\` to its evidence (why build it again)`);
  if (r.status === 'done' && repoKey(r.cells.repo ?? '') !== 'exists' && !tickets.keys.some((k) => k.confirmed)) {
    errors.push(`${at}: ${r.id} is done: needs Repo 'exists' or a confirmed ticket`);
  }
  for (const ref of blockedRefs(r.cells.blocked_by ?? '', r.topic)) {
    const q = byRef.get(ref);
    if (!q || q.table !== 'questions') errors.push(`${at}: ${r.id} is blocked by ${ref}, which is not a question`);
    else if (q.status === 'answered' || q.status === 'dropped') errors.push(`${at}: ${r.id} is still blocked by ${ref}, which is ${q.cells.status}: clear Blocked by`);
  }
}

/** Rows and Changes lines committed at HEAD must still be there: discovery is a history, statuses change, rows stay. */
function historyErrors(root: string, d: Discovery): string[] {
  const errors: string[] = [];
  if (git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']) === undefined) return errors;
  const current = new Map(d.topics.map((t) => [t.slug, t]));
  for (const f of lines(git(root, ['ls-tree', '--name-only', `HEAD:${d.dir}/topics/`]))) {
    if (!f.endsWith('.md')) continue;
    const slug = f.slice(0, -3);
    const now = current.get(slug);
    if (!now) {
      errors.push(`${topicPath(d.dir, slug)}: the topic was deleted (topics are never deleted: mark its rows dropped)`);
      continue;
    }
    const before = parseTopic(git(root, ['show', `HEAD:${now.path}`]) ?? '', slug, now.path);
    const have = new Set(now.rows.map((r) => `${r.table}:${r.id}`));
    for (const r of before.rows) if (r.id && !have.has(`${r.table}:${r.id}`)) errors.push(`${now.path}: ${r.id} was deleted (rows are never deleted: change its status)`);
    const log = new Set(now.changes.map((c) => c.text));
    for (const c of before.changes) if (!log.has(c.text)) errors.push(`${now.path}: a Changes line was edited or removed (append only): ${c.text}`);
  }
  const before = git(root, ['show', `HEAD:${d.dir}/_sources.md`]);
  if (before !== undefined) {
    const have = new Set(d.sources.map((s) => s.label));
    for (const s of parseSources(before).sources) if (!have.has(s.label)) errors.push(`${d.dir}/_sources.md: '${s.label}' was removed (processed sources stay listed)`);
  }
  return errors;
}

export interface StatusItem {
  ref: string;
  topic: string;
  id: string;
  text: string;
  /** Canonical status key. */
  status: string;
  repo?: string;
  tickets?: string[];
  blockedBy?: string[];
  owner?: string;
  to?: string;
  since?: string;
  /** Meetings since the question was last mentioned. */
  silentFor?: number;
}

export interface DiscoveryStatus {
  lastSource?: string;
  sources: number;
  topics: { slug: string; title: string }[];
  todo: StatusItem[];
  outOfScope: StatusItem[];
  questions: StatusItem[];
  /** Open questions by recipient (`Client: Ana`), for the follow-up. */
  byRecipient: Record<string, StatusItem[]>;
  risks: StatusItem[];
  actions: StatusItem[];
  done: StatusItem[];
  baseline: Record<string, number>;
}

function item(r: Row): StatusItem {
  const it: StatusItem = { ref: rowRef(r), topic: r.topic, id: r.id, text: r.cells.text ?? '', status: r.status ?? r.cells.status ?? '' };
  if (r.table === 'features') {
    it.repo = repoKey(r.cells.repo ?? '') ?? r.cells.repo;
    it.tickets = parseTickets(r.cells.ticket ?? '').keys.map((k) => (k.confirmed ? k.key : `~${k.key}`));
    it.blockedBy = blockedRefs(r.cells.blocked_by ?? '', r.topic).map((b) => (b.startsWith(`${r.topic}#`) ? b.slice(r.topic.length + 1) : b));
  }
  if (r.table === 'actions') it.owner = r.cells.owner;
  if (r.table === 'questions') {
    it.to = r.cells.to;
    it.since = r.cells.since;
  }
  return it;
}

const recipientKey = (cell: string | undefined, locale: DiscoveryLocale) => {
  const p = cell ? parseParty(cell) : undefined;
  return p ? `${PARTIES[p.party][locale]}: ${p.names.join(', ')}` : (cell ?? '');
};

export function discoveryStatus(d: Discovery): DiscoveryStatus {
  const last = d.sources.at(-1);
  const topics = d.topics.filter((t) => t.slug !== BASELINE_TOPIC).sort((a, b) => Number(a.slug === UNSORTED_TOPIC) - Number(b.slug === UNSORTED_TOPIC) || a.slug.localeCompare(b.slug));
  const rows = topics.flatMap((t) => t.rows);
  const of = (table: TableKey, keep: (s?: string) => boolean) => rows.filter((r) => r.table === table && keep(r.status)).map(item);
  const silentFor = (r: Row) => {
    const dates = evidencePieces(r.cells.evidence ?? '').map((p) => evidenceSource(p).slice(0, 10)).filter(isDate).sort();
    const lastMention = dates.at(-1) ?? r.cells.since ?? '';
    return d.sources.filter((s) => s.date > lastMention).length;
  };
  const questions = rows
    .filter((r) => r.table === 'questions' && (r.status === 'open' || r.status === 'contradiction'))
    .map((r) => ({ ...item(r), silentFor: silentFor(r) }))
    .sort((a, b) => (a.since ?? '').localeCompare(b.since ?? '') || a.ref.localeCompare(b.ref));
  const byRecipient: Record<string, StatusItem[]> = {};
  for (const q of questions) (byRecipient[recipientKey(q.to, d.locale)] ??= []).push(q);
  const actions = of('actions', (s) => s === 'open' || s === 'scheduled' || s === 'verify').sort((a, b) => recipientKey(a.owner, d.locale).localeCompare(recipientKey(b.owner, d.locale)));
  const baseline: Record<string, number> = {};
  for (const r of d.topics.find((t) => t.slug === BASELINE_TOPIC)?.rows ?? []) if (r.table === 'features') baseline[r.status ?? 'unknown'] = (baseline[r.status ?? 'unknown'] ?? 0) + 1;
  return {
    lastSource: last?.label,
    sources: d.sources.length,
    topics: topics.map((t) => ({ slug: t.slug, title: t.title })),
    todo: of('features', (s) => OPEN_FEATURES.includes(s ?? '')),
    outOfScope: of('features', (s) => s === 'out_of_scope'),
    questions,
    byRecipient,
    risks: of('risks', (s) => s === 'active'),
    actions,
    done: of('features', (s) => s === 'done'),
    baseline,
  };
}

const L = {
  en: {
    title: 'Discovery status',
    generated: 'Generated by `sdlc discovery status` from `topics/`. Do not edit: it is rewritten on every run. `topic#ID` points to `topics/<topic>.md`, where the evidence is.',
    last: 'Last source',
    sources: (n: number) => `${n} ${n === 1 ? 'source' : 'sources'} processed`,
    none: 'none yet',
    todo: 'To do',
    blocked: 'blocked by',
    outOfScope: 'Out of scope',
    questions: 'Open questions (oldest first)',
    silent: (n: number) => `no news in ${n} meetings`,
    risks: 'Active risks',
    actions: 'Open action items',
    done: 'Done',
    baseline: 'Baseline',
    baselineLine: (n: number, parts: string) => `${n} features from \`sdlc discovery seed\` (${parts}) in \`topics/_baseline.md\`; search them with \`sdlc discovery search <words>\`.`,
    empty: '- (none)',
  },
  es: {
    title: 'Estado de discovery',
    generated: 'Generado por `sdlc discovery status` desde `topics/`. No editar: se reescribe en cada corrida. `topic#ID` apunta a `topics/<topic>.md`, donde está la evidencia.',
    last: 'Última fuente',
    sources: (n: number) => `${n} ${n === 1 ? 'fuente procesada' : 'fuentes procesadas'}`,
    none: 'ninguna todavía',
    todo: 'Pendiente',
    blocked: 'bloqueado por',
    outOfScope: 'Fuera de alcance',
    questions: 'Preguntas abiertas (más viejas primero)',
    silent: (n: number) => `sin novedades en ${n} reuniones`,
    risks: 'Riesgos activos',
    actions: 'Accionables abiertos',
    done: 'Hecho',
    baseline: 'Estado inicial',
    baselineLine: (n: number, parts: string) => `${n} features de \`sdlc discovery seed\` (${parts}) en \`topics/_baseline.md\`; buscarlas con \`sdlc discovery search <palabras>\`.`,
    empty: '- (nada)',
  },
};

/** STATUS.md: deterministic (same topics → same bytes), so it only changes in a diff when the state changes. */
export function renderStatus(s: DiscoveryStatus, locale: DiscoveryLocale): string {
  const l = L[locale];
  const out = [`# ${l.title}`, '', `> ${l.generated}`, '', `**${l.last}:** ${s.lastSource ?? l.none} · ${l.sources(s.sources)}`, ''];
  const feature = (it: StatusItem) => {
    const tags = [statusLabel('features', it.status, locale), it.repo ? (REPO_STATES[it.repo as keyof typeof REPO_STATES]?.[locale] ?? it.repo) : '', ...(it.tickets ?? [])].filter(Boolean);
    return `- ${it.ref} [${tags.join(' · ')}] ${it.text}${it.blockedBy?.length ? ` — ${l.blocked} ${it.blockedBy.join(', ')}` : ''}`;
  };
  out.push(`## ${l.todo}`, '');
  if (!s.todo.length) out.push(l.empty, '');
  for (const t of s.topics) {
    const items = s.todo.filter((i) => i.topic === t.slug);
    if (items.length) out.push(`### ${t.title} (\`${t.slug}\`)`, ...items.map(feature), '');
  }
  if (s.outOfScope.length) out.push(`**${l.outOfScope}:** ${s.outOfScope.map((i) => i.ref).join(', ')}`, '');
  out.push(`## ${l.questions}`, '');
  out.push(
    ...(s.questions.length
      ? s.questions.map((q) => {
          const tag = q.status === 'contradiction' ? ` **(${statusLabel('questions', 'contradiction', locale)})**` : '';
          const silent = (q.silentFor ?? 0) >= 2 ? ` · ${l.silent(q.silentFor!)}` : '';
          return `- ${q.since} · ${q.ref}${tag} ${q.text} → ${recipientKey(q.to, locale)}${silent}`;
        })
      : [l.empty]),
    '',
  );
  out.push(`## ${l.risks}`, '', ...(s.risks.length ? s.risks.map((r) => `- ${r.ref} ${r.text}`) : [l.empty]), '');
  out.push(`## ${l.actions}`, '');
  if (!s.actions.length) out.push(l.empty);
  let owner: string | undefined;
  for (const a of s.actions) {
    const o = recipientKey(a.owner, locale);
    if (o !== owner) out.push(`- **${(owner = o)}**`);
    out.push(`  - ${a.ref} [${statusLabel('actions', a.status, locale)}] ${a.text}`);
  }
  out.push('', `## ${l.done}`, '', ...(s.done.length ? s.done.map((i) => `- ${i.ref} ${i.text}`) : [l.empty]), '');
  const total = Object.values(s.baseline).reduce((a, b) => a + b, 0);
  if (total) {
    const parts = Object.entries(s.baseline)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, n]) => `${n} ${statusLabel('features', k, locale)}`)
      .join(', ');
    out.push(`## ${l.baseline}`, '', l.baselineLine(total, parts), '');
  }
  return out.join('\n');
}

export function writeStatus(root: string, loaded: LoadedConfig | undefined): { path: string; status: DiscoveryStatus } {
  const d = loadDiscovery(root, loaded);
  const status = discoveryStatus(d);
  mkdirSync(join(root, d.dir), { recursive: true });
  writeFileSync(join(root, d.dir, 'STATUS.md'), renderStatus(status, d.locale));
  return { path: `${d.dir}/STATUS.md`, status };
}

export interface SearchHit {
  ref: string;
  table: TableKey;
  status: string;
  text: string;
  score: number;
}

/** Rows that mention the words (accents and case ignored), best first: how the agent finds an older request without reading every topic. */
export function searchDiscovery(d: Discovery, query: string, limit = 20): SearchHit[] {
  const words = norm(query).split(/[^\p{L}\p{N}#-]+/u).filter((w) => w.length > 2 || /\d/.test(w));
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  for (const r of allRows(d)) {
    const text = norm(r.cells.text ?? '');
    const rest = norm(Object.values(r.cells).join(' '));
    const score = words.reduce((n, w) => n + (text.includes(w) ? 2 : rest.includes(w) ? 1 : 0), 0);
    if (score) hits.push({ ref: rowRef(r), table: r.table, status: r.cells.status ?? '', text: r.cells.text ?? '', score });
  }
  return hits.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref)).slice(0, limit);
}

export interface AddSourceResult {
  label: string;
  date: string;
  file: string;
  /** The label it was already processed under. */
  duplicate?: string;
  /** The last source, when this one is older. */
  olderThan?: string;
  written: boolean;
}

const fileSlug = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'meeting';

export function dateFromName(file: string): string | undefined {
  const m = /(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/.exec(basename(file));
  const d = m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
  return d && isDate(d) ? d : undefined;
}

/**
 * Register a transcript: refuse one already processed (same SHA-256) and, unless forced, one older than the last
 * source. Copies it into transcripts/ (a PDF also gets a .txt beside it) and appends it to _sources.md. `check` only reports.
 */
export function addSource(
  root: string,
  loaded: LoadedConfig | undefined,
  file: string,
  o: { name: string; date?: string; type?: string; check?: boolean; force?: boolean },
): AddSourceResult {
  if (!existsSync(file) || !statSync(file).isFile()) throw new SdlcError(`transcript not found: ${file}`);
  const ext = extname(file).toLowerCase();
  if (!TRANSCRIPT_EXTENSIONS.includes(ext)) throw new SdlcError(`unsupported transcript ${basename(file)}: use ${TRANSCRIPT_EXTENSIONS.join(', ')} (export Word or Google Docs to PDF)`);
  if (statSync(file).size > MAX_TRANSCRIPT_BYTES) throw new SdlcError(`transcript is larger than ${MAX_TRANSCRIPT_BYTES / 1024 / 1024} MB`);
  const name = o.name.trim().replace(/\|/g, '-');
  if (!name) throw new SdlcError('the source needs a name (--name "Weekly review")');
  const date = o.date ?? dateFromName(file);
  if (!date || !isDate(date)) throw new SdlcError(`meeting date unknown: pass --date YYYY-MM-DD${o.date ? ` (got '${o.date}')` : ' (none in the file name)'}`);
  const type = o.type ?? 'client';
  const typeKey = (Object.keys(SOURCE_TYPES) as SourceType[]).find((k) => matches(type, SOURCE_TYPES[k]));
  if (!typeKey) throw new SdlcError(`unknown source type '${type}': ${Object.keys(SOURCE_TYPES).join(', ')}`);

  const d = loadDiscovery(root, loaded);
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  const label = `${date} ${name}`;
  const target = `transcripts/${date}-${fileSlug(name)}${ext}`;
  const res: AddSourceResult = { label, date, file: `${d.dir}/${target}`, written: false };
  res.duplicate = d.sources.find((s) => s.sha === sha)?.label;
  const last = d.sources.at(-1);
  if (last && date < last.date) res.olderThan = last.label;
  if (d.sources.some((s) => s.label === label) && !res.duplicate) throw new SdlcError(`'${label}' is already a source: give this meeting another --name`);
  if (o.check || res.duplicate || (res.olderThan && !o.force)) return res;

  const base = join(root, d.dir);
  mkdirSync(join(base, 'transcripts'), { recursive: true });
  mkdirSync(join(base, 'topics'), { recursive: true });
  if (loaded?.config.discovery?.commit_transcripts === false) writeFileSync(join(base, 'transcripts', '.gitignore'), '*\n!.gitignore\n');
  copyFileSync(file, join(base, target));
  if (ext === '.pdf') spawnSync('pdftotext', ['-layout', join(base, target), join(base, target.replace(/\.pdf$/, '.txt'))], { stdio: 'ignore' });
  const sourcesFile = join(base, '_sources.md');
  let raw = existsSync(sourcesFile) ? readFileSync(sourcesFile, 'utf8') : sourcesTemplate(d.locale);
  if (!raw.split('\n').some(isSeparator)) raw = sourcesTemplate(d.locale);
  const all = raw.split('\n');
  const row = tableLine([date, name, SOURCE_TYPES[typeKey][d.locale], target, sha]);
  // after the last source on or before this date, so the table stays in date order
  const after = d.sources.filter((s) => s.date <= date).at(-1);
  all.splice(after ? after.line : all.findIndex(isSeparator) + 1, 0, row);
  writeFileSync(sourcesFile, all.join('\n').replace(/\n*$/, '\n'));
  res.written = true;
  return res;
}

export interface BranchInfo {
  name: string;
  /** Last commit date (YYYY-MM-DD). */
  date: string;
  author: string;
  subject: string;
  ahead: number;
  files: string[];
  filesTotal: number;
  tickets: string[];
  /** `changes/…` slug when it is a `change/<slug>` branch. */
  change?: string;
}

/** The branch everything is compared against: discovery.base_branch, vcs.default_branch, origin/HEAD, main. */
export function discoveryBase(root: string, loaded: LoadedConfig | undefined): string {
  const want =
    loaded?.config.discovery?.base_branch ??
    loaded?.config.vcs?.default_branch ??
    git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])?.replace(/^origin\//, '') ??
    'main';
  if (git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${want}`]) !== undefined) return want;
  if (git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${want}`]) !== undefined) return `origin/${want}`;
  throw new SdlcError(`base branch '${want}' not found (set discovery.base_branch)`);
}

/** Branches with commits the base does not have: work in flight that a new request may collide with. */
export function unmergedBranches(root: string, loaded: LoadedConfig | undefined, o: { maxFiles?: number } = {}): BranchInfo[] {
  const base = discoveryBase(root, loaded);
  const baseName = base.replace(/^origin\//, '');
  const refs = lines(git(root, ['for-each-ref', `--no-merged=${base}`, '--format=%(refname)%09%(committerdate:short)%09%(authorname)%09%(subject)', 'refs/heads', 'refs/remotes']));
  const seen = new Set<string>();
  const out: BranchInfo[] = [];
  for (const line of refs) {
    const [ref, date, author, ...subject] = line.split('\t');
    if (ref.endsWith('/HEAD')) continue;
    const local = ref.startsWith('refs/heads/');
    const name = local ? ref.slice('refs/heads/'.length) : ref.slice('refs/remotes/'.length);
    const short = local ? name : name.replace(/^[^/]+\//, '');
    if (short === baseName || seen.has(short)) continue;
    if (!local && refs.some((r) => r.startsWith(`refs/heads/${short}\t`))) continue;
    seen.add(short);
    const files = lines(git(root, ['diff', '--name-only', `${base}...${name}`]));
    const subjects = git(root, ['log', '--format=%s', `${base}..${name}`]) ?? '';
    out.push({
      name,
      date,
      author,
      subject: subject.join('\t'),
      ahead: Number(git(root, ['rev-list', '--count', `${base}..${name}`]) ?? 0),
      files: files.slice(0, o.maxFiles ?? 15),
      filesTotal: files.length,
      tickets: trackerKeys(loaded, `${short}\n${subjects}`),
      change: short.startsWith('change/') ? short.slice('change/'.length) : undefined,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

const F = {
  en: {
    title: (src?: string) => (src ? `Follow-up — ${src}` : 'Follow-up'),
    note: '<!-- Draft from `sdlc discovery followup`: the open questions and the client\'s action items, by recipient. Polish the wording before sending; nothing is sent from here. -->',
    to: 'For',
    fresh: 'New questions',
    pending: 'Still pending',
    since: (d: string) => `pending since ${d}`,
    actions: 'Agreed on your side',
    nothing: 'Nothing pending with the client.',
  },
  es: {
    title: (src?: string) => (src ? `Seguimiento — ${src}` : 'Seguimiento'),
    note: '<!-- Borrador de `sdlc discovery followup`: las preguntas abiertas y los accionables del cliente, por destinatario. Pulir la redacción antes de enviar; desde acá no se envía nada. -->',
    to: 'Para',
    fresh: 'Preguntas nuevas',
    pending: 'Siguen pendientes',
    since: (d: string) => `pendiente desde ${d}`,
    actions: 'Acordado de su lado',
    nothing: 'Nada pendiente con el cliente.',
  },
};

/** The follow-up draft for the client side: new questions from the last source first, then reminders, then their action items. */
export function followupDraft(d: Discovery, locale: DiscoveryLocale): { path: string; body: string } {
  const f = F[locale];
  const last = d.sources.at(-1);
  const rows = d.topics.filter((t) => t.slug !== BASELINE_TOPIC).flatMap((t) => t.rows);
  const toClient = (cell?: string) => {
    const p = cell ? parseParty(cell) : undefined;
    return p?.party === 'client' ? `${PARTIES.client[locale]}: ${p.names.join(', ')}` : undefined;
  };
  const groups = new Map<string, { fresh: string[]; pending: string[]; actions: string[] }>();
  const group = (k: string) => groups.get(k) ?? groups.set(k, { fresh: [], pending: [], actions: [] }).get(k)!;
  const questions = rows.filter((r) => r.table === 'questions' && (r.status === 'open' || r.status === 'contradiction')).sort((a, b) => (a.cells.since ?? '').localeCompare(b.cells.since ?? ''));
  for (const q of questions) {
    const k = toClient(q.cells.to);
    if (!k) continue;
    if (last && q.cells.since === last.date) group(k).fresh.push(`${q.cells.text} (${rowRef(q)})`);
    else group(k).pending.push(`${q.cells.text} — ${f.since(q.cells.since ?? '?')} (${rowRef(q)})`);
  }
  for (const a of rows.filter((r) => r.table === 'actions' && (r.status === 'open' || r.status === 'scheduled'))) {
    const k = toClient(a.cells.owner);
    if (k) group(k).actions.push(`${a.cells.text} (${rowRef(a)})`);
  }
  const out = [`# ${f.title(last?.label)}`, '', f.note, ''];
  if (!groups.size) out.push(f.nothing, '');
  for (const [who, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`## ${f.to} ${who}`, '');
    if (g.fresh.length) out.push(`**${f.fresh}**`, '', ...g.fresh.map((x, i) => `${i + 1}. ${x}`), '');
    if (g.pending.length) out.push(`**${f.pending}**`, '', ...g.pending.map((x, i) => `${i + 1}. ${x}`), '');
    if (g.actions.length) out.push(`**${f.actions}**`, '', ...g.actions.map((x) => `- ${x}`), '');
  }
  const name = last ? `${last.date}-${fileSlug(last.name)}` : 'draft';
  return { path: `${d.dir}/followups/${name}.md`, body: out.join('\n') };
}

export interface DiscoveryRoadmap {
  body: string;
  epics: number;
  stories: string[];
  /** Features left out because an open question blocks them: they become the roadmap's open questions. */
  blocked: string[];
}

/**
 * The body of a roadmap drafted from discovery: one epic per topic, one story per feature ready to build (requested or
 * reimplement, no ticket, nothing blocking it), its `source:` pointing back at `topic#F<n>`. /sdlc-roadmap completes it.
 */
export function discoveryRoadmap(d: Discovery, o: { slug: string; title: string; topics?: string[]; locale: DiscoveryLocale }): DiscoveryRoadmap {
  const es = o.locale === 'es';
  const rows = allRows(d);
  const byRef = new Map(rows.map((r) => [rowRef(r), r]));
  const wanted = o.topics?.length ? o.topics : d.topics.map((t) => t.slug).filter((s) => s !== BASELINE_TOPIC && s !== UNSORTED_TOPIC);
  const unknown = wanted.filter((s) => !d.topics.some((t) => t.slug === s));
  if (unknown.length) throw new SdlcError(`no discovery topic ${unknown.join(', ')} (topics: ${d.topics.map((t) => t.slug).join(', ') || 'none'})`);
  const out: string[] = [
    `# Roadmap: ${o.title}`,
    '',
    es
      ? `<!-- Borrador de \`sdlc roadmap new --from-discovery\` desde ${d.dir} (topics: ${wanted.join(', ')}). /sdlc-roadmap ${o.slug} lo completa: criterios de aceptación, riesgo y dependencias. -->`
      : `<!-- Drafted by \`sdlc roadmap new --from-discovery\` from ${d.dir} (topics: ${wanted.join(', ')}). /sdlc-roadmap ${o.slug} completes it: acceptance criteria, risk and dependencies. -->`,
    '',
  ];
  const stories: string[] = [];
  const blocked: { ref: string; text: string; on: string[] }[] = [];
  let epic = 0;
  for (const slug of wanted) {
    const t = d.topics.find((x) => x.slug === slug)!;
    const ready: Row[] = [];
    for (const r of t.rows) {
      if (r.table !== 'features' || (r.status !== 'requested' && r.status !== 'reimplement')) continue;
      if (parseTickets(r.cells.ticket ?? '').keys.length) continue;
      const on = blockedRefs(r.cells.blocked_by ?? '', r.topic);
      if (on.length) blocked.push({ ref: rowRef(r), text: r.cells.text ?? '', on });
      else ready.push(r);
    }
    if (!ready.length) continue;
    epic++;
    out.push(`## E${epic} · ${t.title}`, '');
    ready.forEach((r, i) => {
      const quotes = evidencePieces(r.cells.evidence ?? '').map((p) => `> ${p}`);
      stories.push(rowRef(r));
      out.push(
        `### E${epic}.S${i + 1} · ${r.cells.text}`,
        '- risk: medium',
        '- depends: -',
        `- source: ${rowRef(r)}`,
        '',
        ...quotes,
        '',
        es ? 'Criterios de aceptación:' : 'Acceptance criteria:',
        `- [ ] ${es ? '<comportamiento observable>' : '<observable behaviour>'}`,
        '',
      );
    });
  }
  out.push(`## ${es ? 'Preguntas abiertas' : 'Open questions'}`);
  blocked.forEach((b, i) => {
    const qs = b.on.map((ref) => {
      const q = byRef.get(ref);
      return `${ref}${q ? ` "${q.cells.text}" (${q.cells.to})` : ''}`;
    });
    out.push(`- Q${i + 1}: ${es ? `${b.ref} "${b.text}" espera ${qs.join(', ')}` : `${b.ref} "${b.text}" waits on ${qs.join(', ')}`}`, '  A:');
  });
  return { body: `${out.join('\n')}\n`, epics: epic, stories, blocked: blocked.map((b) => b.ref) };
}

/** Replace the rows of one table, keeping the rest of the file (headings, comments, other tables) as it is. */
export function replaceTableRows(raw: string, table: TableKey, rows: Record<string, string>[], locale: DiscoveryLocale): string {
  const all = raw.split('\n');
  const def = TABLES[table];
  const start = all.findIndex((l) => {
    const h = /^##\s+(.+?)\s*$/.exec(l);
    return !!h && tableOf(h[1]) === table;
  });
  const cols = def.columns.map(([k]) => k);
  const body = rows.map((r) => tableLine(cols.map((k) => r[k] ?? '')));
  const fresh = [tableLine(def.columns.map(([, n]) => n[locale])), `|${cols.map(() => '---').join('|')}|`, ...body];
  if (start === -1) return `${raw.replace(/\n*$/, '\n')}\n## ${def.title[locale]}\n${fresh.join('\n')}\n`;
  let i = start + 1;
  while (i < all.length && !all[i].trim().startsWith('|') && !/^##\s/.test(all[i])) i++;
  let end = i;
  while (end < all.length && all[end].trim().startsWith('|')) end++;
  if (i < all.length && all[i].trim().startsWith('|')) {
    const header = splitCells(all[i]);
    const keys = header.map((c) => def.columns.find(([, n]) => matches(c, n))?.[0] ?? '');
    const keep = [all[i], all[i + 1] && isSeparator(all[i + 1]) ? all[i + 1] : `|${keys.map(() => '---').join('|')}|`];
    all.splice(i, end - i, ...keep, ...rows.map((r) => tableLine(keys.map((k) => r[k] ?? ''))));
  } else all.splice(start + 1, 0, ...fresh);
  return all.join('\n');
}

export function appendChange(raw: string, line: string, locale: DiscoveryLocale): string {
  const all = raw.replace(/\n*$/, '').split('\n');
  const start = all.findIndex((l) => {
    const h = /^##\s+(.+?)\s*$/.exec(l);
    return !!h && tableOf(h[1]) === 'changes';
  });
  if (start === -1) return `${all.join('\n')}\n\n## ${CHANGES[locale]}\n${line}\n`;
  let end = start + 1;
  while (end < all.length && !/^##\s/.test(all[end])) end++;
  while (end > start + 1 && !all[end - 1].trim()) end--;
  all.splice(end, 0, line);
  return `${all.join('\n')}\n`;
}

export const tablePrefix = (table: TableKey) => TABLES[table].prefix;
export const nextId = (rows: Row[], table: TableKey) => `${TABLES[table].prefix}${Math.max(0, ...rows.filter((r) => r.table === table).map((r) => Number(r.id.slice(1)) || 0)) + 1}`;
export const repoLabel = (k: keyof typeof REPO_STATES, locale: DiscoveryLocale) => REPO_STATES[k][locale];
export const noTicketLabel = (locale: DiscoveryLocale) => NO_TICKET[locale];
