// Stage 6 · control bands. Deterministic detection: mean and σ over a rolling window plus the Western Electric
// rules; an agent is only involved once a band breaks, and the tier decides how far it may go.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ensureSdlcDir } from './events.ts';
import { httpJson, SdlcError } from './http.ts';

export const BANDS_PATH = 'ops/bands.yaml';
export const BANDS_HISTORY_DIR = '.sdlc/bands';

const Tier = z.strictObject({
  action: z.enum(['log', 'diagnose', 'propose']),
  /** Claude Code allowlist for the read-only diagnosis. */
  tools: z.string().optional(),
  /** propose: pull_request (draft PR with the incident intent) and/or runbook:<name> (suggested, a human runs it). */
  routes: z.array(z.string()).optional(),
});

const Source = z.union([
  z.strictObject({ command: z.string() }),
  z.strictObject({
    http_json: z.strictObject({ url: z.string(), path: z.string().optional(), headers: z.record(z.string(), z.string()).optional() }),
  }),
  z.strictObject({
    prometheus: z.strictObject({ url: z.string(), query: z.string(), range: z.string().default('30d'), step: z.string().default('1d') }),
  }),
]);

const Band = z.strictObject({
  metric: z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/i, 'letters, digits, . _ -'),
  description: z.string().optional(),
  source: Source,
  /** Which side is bad: up (e.g. failure rate), down (e.g. throughput) or both. */
  direction: z.enum(['up', 'down', 'both']).default('both'),
  window: z.number().int().positive().optional(),
  min_points: z.number().int().min(3).default(10),
  rules: z.literal('western_electric').default('western_electric'),
  tiers: z.strictObject({ '1sigma': Tier.optional(), '2sigma': Tier.optional(), '3sigma': Tier.optional() }),
});

export const BandsFileSchema = z.strictObject({
  /** Baseline size in points (days for a daily metric). */
  window: z.number().int().positive().default(30),
  bands: z.array(Band).default([]),
});

export type BandsFile = z.infer<typeof BandsFileSchema>;
export type BandConfig = z.infer<typeof Band>;
export type BandTier = z.infer<typeof Tier>;
export type BandSource = z.infer<typeof Source>;

export function loadBands(root: string): BandsFile | undefined {
  const p = join(root, BANDS_PATH);
  if (!existsSync(p)) return undefined;
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new SdlcError(`${BANDS_PATH}: ${(e as Error).message}`);
  }
  const parsed = BandsFileSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new SdlcError(`${BANDS_PATH}: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
  return parsed.data;
}

// ---------- statistics ----------

export type Rule = 'rule1' | 'rule2' | 'rule3' | 'rule4';
export const RULE_TEXT: Record<Rule, string> = {
  rule1: '1 point beyond 3σ',
  rule2: '2 of 3 points beyond 2σ',
  rule3: '4 of 5 points beyond 1σ',
  rule4: '8 points on one side of the mean',
};

export interface Evaluation {
  status: 'ok' | 'broken' | 'insufficient';
  /** 0 = within band, 1..3 = σ tier reached. */
  level: 0 | 1 | 2 | 3;
  rule?: Rule;
  value: number;
  mean: number;
  sigma: number;
  /** z-score of the latest point. */
  z: number;
  points: number;
}

/**
 * Western Electric over `series` (oldest first): the baseline is up to `window` points before the most
 * recent ones, which are tested against it. Rule 1 → 3σ, rule 2 → 2σ, rules 3–4 → 1σ.
 */
export function evaluateBand(series: number[], opts: { window: number; direction: 'up' | 'down' | 'both'; minPoints: number }): Evaluation {
  const value = series.at(-1) ?? NaN;
  const tail = Math.min(8, series.length - opts.minPoints);
  const base = { level: 0 as const, value, mean: NaN, sigma: NaN, z: NaN, points: series.length };
  if (tail < 1) return { status: 'insufficient', ...base };
  const baseline = series.slice(0, -tail).slice(-opts.window);
  const recent = series.slice(-tail);
  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const sigma = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / (baseline.length - 1));
  const zOf = (v: number) => (sigma > 0 ? (v - mean) / sigma : v === mean ? 0 : Math.sign(v - mean) * Infinity);
  const zs = recent.map(zOf);
  const z = zs.at(-1)!;
  const sides = opts.direction === 'up' ? [1] : opts.direction === 'down' ? [-1] : [1, -1];

  const beyond = (k: number, n: number, sd: number, side: number) => {
    const last = zs.slice(-n);
    return last.length === n && side * last.at(-1)! > sd && last.filter((x) => side * x > sd).length >= k;
  };
  let level: Evaluation['level'] = 0;
  let rule: Rule | undefined;
  for (const s of sides) {
    const hit: [Evaluation['level'], Rule] | undefined =
      s * z > 3 ? [3, 'rule1'] : beyond(2, 3, 2, s) ? [2, 'rule2'] : beyond(4, 5, 1, s) ? [1, 'rule3'] : zs.length >= 8 && zs.slice(-8).every((x) => s * x > 0) ? [1, 'rule4'] : undefined;
    if (hit && hit[0] > level) [level, rule] = hit;
  }
  return { status: level ? 'broken' : 'ok', level, rule, value, mean, sigma, z, points: series.length };
}

/** Highest configured tier at or below the level reached. */
export function tierFor(band: BandConfig, level: number): { sigma: 1 | 2 | 3; tier: BandTier } | undefined {
  for (let l = level; l >= 1; l--) {
    const tier = band.tiers[`${l}sigma` as '1sigma'];
    if (tier) return { sigma: l as 1 | 2 | 3, tier };
  }
  return undefined;
}

// ---------- sources ----------

const expandEnv = (s: string, env: NodeJS.ProcessEnv) => s.replace(/\$\{(\w+)\}/g, (_m, k: string) => env[k] ?? '');

function toNumbers(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((x) => Number(Array.isArray(x) ? x.at(-1) : x));
  return [Number(v)];
}

function at(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

/** "30d" → seconds. */
export function durationSeconds(s: string): number {
  const m = /^(\d+)([smhdw])$/.exec(s.trim());
  if (!m) throw new SdlcError(`invalid duration '${s}' (e.g. 30d, 12h)`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[m[2] as 's'];
}

/** Values from the source, oldest first. One value means "current reading" (kept in the local history). */
export async function readSource(root: string, source: BandSource, env: NodeJS.ProcessEnv = process.env): Promise<number[]> {
  let values: number[];
  if ('command' in source) {
    let out: string;
    try {
      out = execFileSync('sh', ['-c', source.command], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
    } catch (e) {
      throw new SdlcError(`command failed: ${source.command}: ${(e as { stderr?: string }).stderr?.trim() || (e as Error).message}`);
    }
    const text = out.trim();
    values = text.startsWith('[') ? toNumbers(JSON.parse(text)) : text.split('\n').filter(Boolean).map((l) => Number(l.trim().split(/\s+/).at(-1)));
  } else if ('http_json' in source) {
    const h = source.http_json;
    const headers = Object.fromEntries(Object.entries(h.headers ?? {}).map(([k, v]) => [k, expandEnv(v, env)]));
    values = toNumbers(at(await httpJson('GET', expandEnv(h.url, env), headers), h.path));
  } else {
    const p = source.prometheus;
    const end = Math.floor(Date.now() / 1000);
    const q = new URLSearchParams({ query: p.query, start: String(end - durationSeconds(p.range)), end: String(end), step: String(durationSeconds(p.step)) });
    const r = await httpJson('GET', `${expandEnv(p.url, env).replace(/\/$/, '')}/api/v1/query_range?${q}`, {});
    const series = r?.data?.result?.[0]?.values;
    if (!Array.isArray(series)) throw new SdlcError(`prometheus: no series for ${p.query}`);
    values = toNumbers(series);
  }
  if (!values.length || values.some((v) => !Number.isFinite(v))) throw new SdlcError('source did not return numbers');
  return values;
}

export function historyPath(root: string, metric: string): string {
  return join(root, BANDS_HISTORY_DIR, `${metric}.jsonl`);
}

export function readHistory(root: string, metric: string): number[] {
  const p = historyPath(root, metric);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => Number(JSON.parse(l).value))
    .filter(Number.isFinite);
}

export function appendHistory(root: string, metric: string, value: number): void {
  ensureSdlcDir(root);
  mkdirSync(join(root, BANDS_HISTORY_DIR), { recursive: true });
  appendFileSync(historyPath(root, metric), JSON.stringify({ ts: new Date().toISOString(), value }) + '\n');
}

export interface BandResult extends Omit<Evaluation, 'status'> {
  status: Evaluation['status'] | 'error';
  metric: string;
  source: 'series' | 'history';
  error?: string;
}

/** Read every band and evaluate it. `record` appends single readings to the history (off for dry runs). */
export async function checkBands(root: string, file: BandsFile, opts: { record: boolean; env?: NodeJS.ProcessEnv }): Promise<BandResult[]> {
  const results: BandResult[] = [];
  for (const band of file.bands) {
    const window = band.window ?? file.window;
    try {
      const values = await readSource(root, band.source, opts.env);
      let series = values;
      let source: BandResult['source'] = 'series';
      if (values.length === 1) {
        source = 'history';
        series = [...readHistory(root, band.metric), values[0]];
        if (opts.record) appendHistory(root, band.metric, values[0]);
      }
      results.push({ metric: band.metric, source, ...evaluateBand(series.slice(-(window + 8)), { window, direction: band.direction, minPoints: band.min_points }) });
    } catch (e) {
      results.push({ metric: band.metric, source: 'series', status: 'error', level: 0, value: NaN, mean: NaN, sigma: NaN, z: NaN, points: 0, error: (e as Error).message });
    }
  }
  return results;
}
