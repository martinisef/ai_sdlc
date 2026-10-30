// Typed client for the local server (packages/server). The token is injected into index.html by the server.
import { useCallback, useEffect, useRef, useState } from 'react';

const meta = document.querySelector('meta[name="sdlc-token"]')?.getAttribute('content');
const TOKEN = meta && meta !== '__SDLC_TOKEN__' ? meta : (new URLSearchParams(location.search).get('token') ?? '');

let workspace = '';
export const setWorkspace = (ws: string) => (workspace = ws);

function url(path: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams({ ...params, ...(workspace ? { ws: workspace } : {}) });
  return `/api${path}${q.size ? `?${q}` : ''}`;
}

export async function api<T>(path: string, init: RequestInit & { params?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url(path, init.params), {
    ...init,
    headers: { 'content-type': 'application/json', 'x-sdlc-token': TOKEN, ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { body });
  return body as T;
}

/** Live data: refetches when the server reports a change in changes/, .sdlc/ or git refs. */
export function useApi<T>(path: string, params?: Record<string, string>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const key = JSON.stringify([path, params, workspace]);
  const reload = useCallback(() => {
    api<T>(path, { params })
      .then((d) => {
        setData(d);
        setError(undefined);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(reload, [reload]);
  useLive(reload);
  return { data, error, reload };
}

const listeners = new Set<() => void>();
let source: EventSource | undefined;
let sourceWs: string | undefined;

function ensureSource() {
  if (source && sourceWs === workspace) return;
  source?.close();
  sourceWs = workspace;
  source = new EventSource(url('/stream', { token: TOKEN }));
  source.addEventListener('change', () => listeners.forEach((l) => l()));
}

export function useLive(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ensureSource();
    const l = () => ref.current();
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
}

// ---------- types (mirror packages/core) ----------

export type Artifact = 'intent' | 'spec' | 'plan';
export type Column = 'intent' | 'spec' | 'plan' | 'build' | 'review' | 'merged' | 'rejected';

export interface PullRequest {
  number: number;
  url: string;
  state: 'open' | 'merged' | 'closed' | 'draft';
  title?: string;
}

export interface ChangeSummary {
  id: string;
  dir: string;
  slug: string;
  source: 'worktree' | { branch: string };
  branch?: string;
  active: boolean;
  stage: string;
  column: Column;
  next: string;
  waitingFor?: Artifact;
  title?: string;
  ticket?: string;
  origin?: string;
  author?: string;
  risk?: string;
  statuses: string;
  pr?: PullRequest;
  /** whether the current git user may decide the pending gate */
  canDecide?: { ok: boolean; reason?: string };
  artifacts: Partial<Record<Artifact, { path: string; status?: string; data: Record<string, string> }>>;
}

export interface ChangeDetail extends Omit<ChangeSummary, 'artifacts'> {
  artifacts: Partial<Record<Artifact, { path: string; status?: string; data: Record<string, string>; body: string }>>;
  gates: Partial<Record<Artifact, { ok: boolean; reason?: string }>>;
  timeline: { sha: string; author: string; email: string; date: string; subject: string; agent: boolean }[];
}

export interface State {
  root: string;
  name: string;
  configured: boolean;
  configPath?: string;
  locale: 'en' | 'es';
  agents: string[];
  user: { name?: string; email?: string };
  branch?: string;
}

export interface SdlcEvent {
  ts: string;
  type: string;
  agent?: string;
  policy?: string;
  metric?: string;
  change?: string;
  artifact?: string;
  by?: string;
  detail?: string;
}

export interface Metrics {
  changes: { change: string; stage: string; origin?: string; intentToSpecH?: number; specToPlanH?: number; specReworkAfterPlan?: number; firstCommitAt?: string }[];
  summary: {
    changes: number;
    byStage: Record<string, number>;
    byOrigin: Record<string, number>;
    medianIntentToSpecH?: number;
    medianSpecToPlanH?: number;
    specReworkRate?: number;
    guardrailBlocks: Record<string, number>;
    gateDecisions: number;
  };
}

export interface Check {
  id: string;
  ok: boolean;
  level: 'error' | 'warn' | 'info';
  message: string;
}

export interface Doctor {
  checks: Check[];
  agents: ('claude' | 'cursor' | 'agents-md')[];
  matrix: ({ guardrail: string } & Record<'claude' | 'cursor' | 'agents-md', string[]>)[];
}

export interface Workspace {
  path: string;
  name: string;
  configured: boolean;
}
