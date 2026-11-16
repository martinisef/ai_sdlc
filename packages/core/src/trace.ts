// Traceability: every requirement the spec numbers (R1, R2…) is covered by the plan's Verification section, and the
// plan names no requirement the spec does not have. Deterministic, so the plan gate can refuse a plan that drops one.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Change } from './changes.ts';
import { git } from './git.ts';

export interface TraceResult {
  change: string;
  /** Requirement IDs defined in spec.md, in order. */
  requirements: string[];
  /** Requirement → the Verification line that covers it. */
  covered: Record<string, string>;
  missing: string[];
  orphans: string[];
  errors: string[];
  warnings: string[];
}

const VERIFICATION = /^##\s+(verification|verificaci[oó]n|prueba|pruebas|testing)\s*$/i;
const DEFINITION = /^\s*[-*]\s*\**(R\d+)\**\s*[:.)\-—]/;
const REF = /\bR(\d+)(?:\s*(?:[–—-]|\.\.|to|a)\s*R(\d+)|[–—-](\d+))?\b/g;

/** `R1, R3–R5` → R1, R3, R4, R5 (also `R3-5`, `R3..R5`). */
function refsIn(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(REF)) {
    const from = Number(m[1]);
    const end = m[2] ?? m[3];
    const to = end ? Number(end) : from;
    for (let n = from; n <= Math.min(to, from + 50); n++) out.push(`R${n}`);
  }
  return out;
}

const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');

function section(body: string, heading: RegExp): string[] | undefined {
  const lines = stripComments(body).split('\n');
  const i = lines.findIndex((l) => heading.test(l.trim()));
  if (i < 0) return undefined;
  const out: string[] = [];
  for (let j = i + 1; j < lines.length && !/^#{1,2}\s/.test(lines[j]); j++) out.push(lines[j]);
  return out;
}

const fileExists = (root: string, change: Change, path: string) =>
  change.source === 'worktree' ? existsSync(join(root, path)) : git(root, ['cat-file', '-e', `${change.source.branch}:${path}`]) !== undefined;

/** Backticked tokens that look like a file path (`tests/test_notes.py`), not a command (`make test`). */
const pathsIn = (line: string) => [...line.matchAll(/`([^`\s]+\/[^`\s]+\.[A-Za-z0-9]+)`/g)].map((m) => m[1].replace(/:\d+$/, ''));

export function traceChange(root: string, change: Change): TraceResult {
  const r: TraceResult = { change: change.id, requirements: [], covered: {}, missing: [], orphans: [], errors: [], warnings: [] };
  const spec = change.artifacts.spec;
  const plan = change.artifacts.plan;
  if (!spec) {
    r.warnings.push(`${change.id} has no spec.md: nothing to trace (a plan from the intent covers its problem instead)`);
    return r;
  }
  for (const line of stripComments(spec.body).split('\n')) {
    const m = DEFINITION.exec(line);
    if (m && !r.requirements.includes(m[1]) && line.replace(DEFINITION, '').trim()) r.requirements.push(m[1]);
  }
  if (!r.requirements.length) r.warnings.push(`${spec.path} numbers no requirements (- R1: …): nothing to trace`);
  if (!plan) return r;
  const verification = section(plan.body, VERIFICATION);
  if (!verification) {
    if (r.requirements.length) r.errors.push(`${plan.path} has no ## Verification section: list how each requirement is checked (- R1: <test or command>)`);
    return r;
  }
  for (const line of verification) for (const id of refsIn(line)) if (!r.covered[id]) r.covered[id] = line.replace(/^\s*[-*]\s*/, '').trim();
  r.missing = r.requirements.filter((id) => !r.covered[id]);
  for (const id of r.missing) r.errors.push(`${id} from spec.md is not in the plan's Verification: say which test or check proves it (- ${id}: …)`);
  if (!r.requirements.length) return r;
  r.orphans = Object.keys(r.covered).filter((id) => !r.requirements.includes(id)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  for (const id of r.orphans) r.errors.push(`${plan.path} names ${id}, which spec.md does not define`);
  for (const line of verification) for (const p of pathsIn(line)) if (!fileExists(root, change, p)) r.warnings.push(`${p} (in Verification) does not exist yet: /sdlc-build writes it, or fix the path`);
  return r;
}
