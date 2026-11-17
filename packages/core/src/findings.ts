// Review findings with stable IDs: spec-reviewer's go in spec.md (S1, S2…) and the verifier's in plan.md (V1, V2…),
// as a table under "## Review findings" / "## Verification findings". A re-review reuses the IDs, so the gate can tell
// what is still open: an open Blocking finding stops the approval, and the ones approved open are recorded as accepted.
import type { Change } from './changes.ts';

export type Severity = 'blocking' | 'important' | 'minor';
export type FindingStatus = 'open' | 'resolved' | 'accepted';

export interface Finding {
  id: string;
  severity?: Severity;
  finding: string;
  status?: FindingStatus;
  note: string;
  /** spec.md or plan.md path. */
  path: string;
}

export interface FindingsResult {
  findings: Finding[];
  /** Malformed rows: duplicate IDs, a severity or status outside the vocabulary. */
  problems: string[];
}

const HEADING = /^##\s+(review findings|verification findings|hallazgos de la revisi[oó]n|hallazgos de la verificaci[oó]n)\s*$/i;
const SEVERITY: Record<string, Severity> = { blocking: 'blocking', bloqueante: 'blocking', important: 'important', importante: 'important', minor: 'minor', menor: 'minor' };
const STATUS: Record<string, FindingStatus> = { open: 'open', abierto: 'open', resolved: 'resolved', resuelto: 'resolved', accepted: 'accepted', aceptado: 'accepted' };
const ACCEPTED: Record<string, string> = { open: 'accepted', abierto: 'aceptado' };
const PREFIX = { spec: 'S', plan: 'V' } as const;

const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

/** Table rows of the findings section: line index and cells (ID, severity, finding, status, note). */
function rows(text: string): { i: number; cells: string[] }[] {
  const lines = text.split('\n');
  const out: { i: number; cells: string[] }[] = [];
  let inside = false;
  let comment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (comment) {
      if (line.includes('-->')) comment = false;
      continue;
    }
    if (line.includes('<!--') && !line.includes('-->')) {
      comment = true;
      continue;
    }
    if (/^#{1,2}\s/.test(line)) inside = HEADING.test(line.trim());
    else if (inside && line.trim().startsWith('|')) {
      const cells = cellsOf(line);
      if (/^[A-Z]\d+$/.test(cells[0] ?? '') && cells[2]) out.push({ i, cells });
    }
  }
  return out;
}

export function parseFindings(text: string, artifact: 'spec' | 'plan', path = `${artifact}.md`): FindingsResult {
  const r: FindingsResult = { findings: [], problems: [] };
  const prefix = PREFIX[artifact];
  for (const { cells } of rows(text)) {
    const [id, sev = '', finding, st = '', note = ''] = cells;
    if (!id.startsWith(prefix)) r.problems.push(`${path}: ${id} should be numbered ${prefix}1, ${prefix}2… in this file`);
    if (r.findings.some((f) => f.id === id)) r.problems.push(`${path}: ${id} appears twice; IDs are never reused or renumbered`);
    const severity = SEVERITY[sev.toLowerCase().replace(/\*/g, '')];
    const status = STATUS[st.toLowerCase().replace(/\*/g, '')];
    if (!severity) r.problems.push(`${path}: ${id} has severity "${sev}" (Blocking, Important or Minor)`);
    if (!status) r.problems.push(`${path}: ${id} has status "${st}" (open, resolved or accepted)`);
    r.findings.push({ id, severity, finding, status, note, path });
  }
  return r;
}

/** Findings of a change: spec.md (S…) then plan.md (V…). */
export function changeFindings(change: Change): FindingsResult {
  const r: FindingsResult = { findings: [], problems: [] };
  for (const a of ['spec', 'plan'] as const) {
    const info = change.artifacts[a];
    if (!info) continue;
    const p = parseFindings(info.raw, a, info.path);
    r.findings.push(...p.findings);
    r.problems.push(...p.problems);
  }
  return r;
}

/** Open findings that stop a gate (Blocking) and the ones a person accepts by approving anyway. */
export function openFindings(r: FindingsResult): { blocking: Finding[]; acceptable: Finding[] } {
  const open = r.findings.filter((f) => f.status === 'open');
  return { blocking: open.filter((f) => f.severity === 'blocking'), acceptable: open.filter((f) => f.severity !== 'blocking') };
}

/** Marks `ids` accepted (keeping the table's language) and notes who accepted them when the note is empty. */
export function acceptFindings(text: string, ids: string[], note: string): string {
  const lines = text.split('\n');
  for (const { i, cells } of rows(text)) {
    if (!ids.includes(cells[0])) continue;
    const word = ACCEPTED[(cells[3] ?? '').toLowerCase().replace(/\*/g, '')];
    if (!word) continue;
    while (cells.length < 5) cells.push('');
    cells[3] = word;
    if (!cells[4]) cells[4] = note;
    lines[i] = `| ${cells.join(' | ')} |`;
  }
  return lines.join('\n');
}
