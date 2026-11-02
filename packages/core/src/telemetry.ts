// Opt-in usage telemetry. Off by default; sends only when the person turned it on (`sdlc telemetry on`)
// AND SDLC_TELEMETRY_URL is set; DO_NOT_TRACK wins over both. At most once a day, counts only:
// no names, emails, paths, repository or change names. docs/reference/telemetry.md lists every field.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import type { LoadedConfig } from './config.ts';
import { readEvents } from './events.ts';
import { funnel } from './funnel.ts';

export interface TelemetrySettings {
  enabled: boolean;
  /** Random install id, not derived from anything about the person or machine. */
  id: string;
  last_sent?: string;
}

export function telemetryPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config');
  return join(base, 'sdlc', 'telemetry.json');
}

export function readTelemetry(env: NodeJS.ProcessEnv = process.env): TelemetrySettings {
  try {
    const s = JSON.parse(readFileSync(telemetryPath(env), 'utf8')) as Partial<TelemetrySettings>;
    return { enabled: s.enabled === true, id: s.id || randomUUID(), last_sent: s.last_sent };
  } catch {
    return { enabled: false, id: randomUUID() };
  }
}

export function writeTelemetry(s: TelemetrySettings, env: NodeJS.ProcessEnv = process.env): void {
  const p = telemetryPath(env);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
}

const doNotTrack = (env: NodeJS.ProcessEnv) => !!env.DO_NOT_TRACK && env.DO_NOT_TRACK !== '0' && env.DO_NOT_TRACK !== 'false';

export type TelemetryState = 'on' | 'off' | 'blocked-dnt' | 'no-endpoint';

export function telemetryState(env: NodeJS.ProcessEnv = process.env): TelemetryState {
  if (doNotTrack(env)) return 'blocked-dnt';
  if (!readTelemetry(env).enabled) return 'off';
  if (!env.SDLC_TELEMETRY_URL) return 'no-endpoint';
  return 'on';
}

export interface TelemetryPayload {
  schema: 1;
  id: string;
  version: string;
  os: string;
  node: string;
  ci: boolean;
  agents: string[];
  locale: string;
  tracker: string;
  vcs: string;
  funnel: ReturnType<typeof funnel>;
  /** Activity-log event counts in the last 24 hours, by type. */
  events: Record<string, number>;
}

export function telemetryPayload(root: string, loaded: LoadedConfig | undefined, version: string, env: NodeJS.ProcessEnv = process.env): TelemetryPayload {
  const since = Date.now() - 24 * 3600_000;
  const events: Record<string, number> = {};
  for (const e of readEvents(root, 5000)) if (Date.parse(e.ts) >= since) events[e.type] = (events[e.type] ?? 0) + 1;
  return {
    schema: 1,
    id: readTelemetry(env).id,
    version,
    os: platform(),
    node: process.versions.node,
    ci: !!env.CI,
    agents: [...(loaded?.config.agents ?? [])],
    locale: loaded?.config.locale ?? 'en',
    tracker: loaded?.config.tracker?.provider ?? 'none',
    vcs: loaded?.config.vcs?.provider ?? 'unknown',
    funnel: funnel(root, loaded),
    events,
  };
}

/** Sends the daily payload when allowed. Never throws and never waits more than `timeoutMs`. */
export async function maybeSendTelemetry(root: string, loaded: LoadedConfig | undefined, version: string, env: NodeJS.ProcessEnv = process.env, timeoutMs = 1500): Promise<boolean> {
  try {
    if (telemetryState(env) !== 'on' || !existsSync(join(root, '.git'))) return false;
    const s = readTelemetry(env);
    if (s.last_sent && Date.now() - Date.parse(s.last_sent) < 24 * 3600_000) return false;
    const body = JSON.stringify(telemetryPayload(root, loaded, version, env));
    writeTelemetry({ ...s, last_sent: new Date().toISOString() }, env);
    const r = await fetch(env.SDLC_TELEMETRY_URL!, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}
