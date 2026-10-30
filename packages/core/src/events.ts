// Local activity log (.sdlc/events.jsonl, gitignored): guardrail blocks, sessions, gate decisions.
// It feeds the dashboard's activity view; the audit trail that matters stays in git.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SdlcEvent {
  ts: string;
  type: 'guardrail.block' | 'guardrail.warn' | 'guardrail.override' | 'session.start' | 'gate.approve' | 'gate.reject' | 'sync' | 'band.break';
  metric?: string;
  agent?: string;
  policy?: string;
  change?: string;
  artifact?: string;
  by?: string;
  detail?: string;
}

export const EVENTS_PATH = '.sdlc/events.jsonl';
const LOCAL_FILES = ['events.jsonl', 'fix-lock', 'ui-token', 'bands/'];

/** `.sdlc/` holds committed config next to local-only state; keep the latter out of git. */
export function ensureSdlcDir(root: string): string {
  const dir = join(root, '.sdlc');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, LOCAL_FILES.join('\n') + '\n');
  return dir;
}

export function recordEvent(root: string, event: Omit<SdlcEvent, 'ts'>): void {
  try {
    ensureSdlcDir(root);
    appendFileSync(join(root, EVENTS_PATH), JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
  } catch {
    // never let logging break a hook
  }
}

export function readEvents(root: string, limit = 500): SdlcEvent[] {
  const p = join(root, EVENTS_PATH);
  if (!existsSync(p)) return [];
  const out: SdlcEvent[] = [];
  for (const line of readFileSync(p, 'utf8').split('\n').slice(-limit - 1)) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip a torn line
    }
  }
  return out.reverse();
}
