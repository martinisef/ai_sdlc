// Local dashboard server: a thin HTTP layer over the core. Binds to 127.0.0.1 only; every API call needs
// the per-run token injected into the page, and the Host header must be local (DNS-rebinding guard).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { doctor, sync } from '@ai-native-sdlc/adapters';
import {
  ARTIFACTS,
  canApprove,
  columnOf,
  configJsonSchema,
  decideGate,
  getChange,
  git,
  gitUser,
  lines,
  listChanges,
  loadConfig,
  localeOf,
  metrics,
  prForBranch,
  readEvents,
  validateConfig,
  writeConfig,
  CONFIG_PATH,
  type Artifact,
  type Change,
  type PullRequest,
} from '@ai-native-sdlc/core';

const here = dirname(fileURLToPath(import.meta.url));

function uiDir(): string | undefined {
  const candidates = [process.env.SDLC_UI_DIR, join(here, 'ui'), join(here, '..', '..', 'ui', 'dist')];
  return candidates.find((c) => c && existsSync(join(c, 'index.html')));
}

const WORKSPACES_FILE = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'sdlc', 'workspaces.json');

function loadWorkspaces(current: string): string[] {
  let list: string[] = [];
  try {
    list = JSON.parse(readFileSync(WORKSPACES_FILE, 'utf8'));
  } catch {
    // first run
  }
  return [current, ...list.filter((p) => p !== current && existsSync(p))];
}

function saveWorkspaces(list: string[]) {
  mkdirSync(dirname(WORKSPACES_FILE), { recursive: true });
  writeFileSync(WORKSPACES_FILE, JSON.stringify([...new Set(list)], null, 2));
}

// PR lookups shell out to gh/glab: cache them so the board stays fast.
const prCache = new Map<string, { at: number; pr?: PullRequest }>();
function cachedPr(root: string, branch: string, loaded: ReturnType<typeof loadConfig>): PullRequest | undefined {
  const key = `${root}#${branch}`;
  const hit = prCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.pr;
  const pr = prForBranch(root, branch, loaded);
  prCache.set(key, { at: Date.now(), pr });
  return pr;
}

function summary(c: Change, pr?: PullRequest) {
  const { artifacts, ...rest } = c;
  return {
    ...rest,
    column: columnOf(c.stage, pr?.state === 'open' || pr?.state === 'draft'),
    pr,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([k, a]) => [k, { path: a!.path, status: a!.status, data: a!.data }])),
  };
}

function timeline(root: string, c: Change) {
  const fmt = '%h%x1f%an%x1f%ae%x1f%cI%x1f%s';
  const refs = c.branch ? [c.branch] : ['HEAD'];
  return lines(git(root, ['log', ...refs, `--format=${fmt}`, '-n', '100', '--', c.id])).map((l) => {
    const [sha, author, email, date, subject] = l.split('\x1f');
    return { sha, author, email, date, subject, agent: /claude|cursor|codex|bot|noreply/i.test(`${author} ${email}`) };
  });
}

export interface ServerOptions {
  root: string;
  port?: number;
  open?: boolean;
}

export function createApp(opts: { root: string; token: string }) {
  const app = new Hono();
  let workspaces = loadWorkspaces(opts.root);

  app.use('*', async (c, next) => {
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return c.text('forbidden host', 403);
    if (c.req.path.startsWith('/api/')) {
      const token = c.req.header('x-sdlc-token') ?? c.req.query('token');
      if (token !== opts.token) return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });

  const ws = (c: { req: { query: (k: string) => string | undefined } }) => {
    const q = c.req.query('ws');
    const root = q ? resolve(q) : opts.root;
    if (!workspaces.includes(root)) throw new Error(`unknown workspace: ${root}`);
    return root;
  };

  app.onError((err, c) => c.json({ error: err.message }, 400));

  app.get('/api/workspaces', (c) => c.json(workspaces.map((p) => ({ path: p, name: basename(p), configured: !!loadConfig(p) }))));
  app.post('/api/workspaces', async (c) => {
    const { path } = await c.req.json<{ path: string }>();
    const p = resolve(path);
    if (!existsSync(join(p, '.git'))) throw new Error(`${p} is not a git repository`);
    workspaces = [...workspaces.filter((w) => w !== p), p];
    saveWorkspaces(workspaces.slice(1).concat(opts.root));
    return c.json({ ok: true });
  });

  app.get('/api/state', (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    return c.json({
      root,
      name: basename(root),
      configured: !!loaded,
      configPath: loaded?.path,
      locale: localeOf(loaded),
      agents: loaded?.config.agents ?? [],
      user: gitUser(root),
      branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    });
  });

  app.get('/api/changes', (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    const withPr = c.req.query('pr') === '1';
    const changes = listChanges(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch });
    const who = gitUser(root);
    return c.json(
      changes.map((ch) => ({
        ...summary(ch, withPr && ch.branch ? cachedPr(root, ch.branch, loaded) : undefined),
        canDecide: ch.waitingFor ? canApprove(ch, ch.waitingFor, who, loaded) : undefined,
      })),
    );
  });

  app.get('/api/changes/:dir', (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    const ch = getChange(root, c.req.param('dir'), { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch });
    if (!ch) return c.json({ error: 'not found' }, 404);
    const who = gitUser(root);
    const gates = Object.fromEntries(ARTIFACTS.filter((a) => ch.artifacts[a]).map((a) => [a, canApprove(ch, a, who, loaded)]));
    const pr = ch.branch ? cachedPr(root, ch.branch, loaded) : undefined;
    return c.json({ ...summary(ch, pr), artifacts: ch.artifacts, gates, timeline: timeline(root, ch) });
  });

  app.post('/api/changes/:dir/gates/:artifact', async (c) => {
    const root = ws(c);
    const artifact = c.req.param('artifact') as Artifact;
    if (!ARTIFACTS.includes(artifact)) throw new Error(`unknown artifact: ${artifact}`);
    const body = await c.req.json<{ decision: 'approved' | 'rejected'; comment?: string }>();
    const r = decideGate(root, loadConfig(root), c.req.param('dir'), artifact, body.decision === 'rejected' ? 'rejected' : 'approved', { comment: body.comment });
    return c.json(r);
  });

  app.get('/api/metrics', (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    return c.json(metrics(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch }));
  });

  app.get('/api/events', (c) => c.json(readEvents(ws(c), Number(c.req.query('limit') ?? 300))));

  app.get('/api/config', (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    return c.json({ path: loaded?.path ?? CONFIG_PATH, legacy: loaded?.legacy ?? false, config: loaded?.config ?? null, issues: loaded?.issues ?? [], schema: configJsonSchema() });
  });

  app.put('/api/config', async (c) => {
    const root = ws(c);
    const { config, dryRun } = await c.req.json<{ config: unknown; dryRun?: boolean }>();
    const v = validateConfig(config);
    if (!v.ok) return c.json({ ok: false, issues: v.issues }, 422);
    const loaded = loadConfig(root);
    const before = loaded ? JSON.stringify(loaded.config, null, 2) : '';
    const after = JSON.stringify(v.config, null, 2);
    if (dryRun) return c.json({ ok: true, before, after });
    writeConfig(root, v.config, loaded?.path ?? CONFIG_PATH);
    const report = sync(root, loadConfig(root)!);
    return c.json({ ok: true, before, after, sync: report });
  });

  app.get('/api/doctor', (c) => c.json(doctor(ws(c))));
  app.post('/api/sync', async (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    if (!loaded) throw new Error('not configured — run `sdlc init`');
    const { force } = await c.req.json<{ force?: boolean }>().catch(() => ({ force: false }));
    return c.json(sync(root, loaded, { force }));
  });

  app.get('/api/stream', (c) => {
    const root = ws(c);
    return streamSSE(c, async (stream) => {
      let timer: NodeJS.Timeout | undefined;
      const watchers: FSWatcher[] = [];
      const ping = () => {
        clearTimeout(timer);
        timer = setTimeout(() => void stream.writeSSE({ event: 'change', data: String(Date.now()) }), 300);
      };
      for (const p of ['changes', '.sdlc', '.git/refs', '.git/HEAD', CONFIG_PATH]) {
        const full = join(root, p);
        if (!existsSync(full)) continue;
        try {
          watchers.push(watch(full, { recursive: !extname(p) && p !== '.git/HEAD' }, ping));
        } catch {
          // some filesystems do not support recursive watch; polling below still refreshes
        }
      }
      const keepalive = setInterval(() => void stream.writeSSE({ event: 'ping', data: '' }), 25_000);
      await new Promise<void>((done) => stream.onAbort(done));
      clearInterval(keepalive);
      clearTimeout(timer);
      for (const w of watchers) w.close();
    });
  });

  const dir = uiDir();
  app.get('*', (c) => {
    if (!dir) return c.html('<p>UI not built. Run <code>npm run build:ui</code>.</p>');
    const rel = c.req.path === '/' ? 'index.html' : c.req.path.slice(1);
    const file = resolve(dir, rel);
    const target = file.startsWith(dir) && existsSync(file) && extname(file) ? file : join(dir, 'index.html');
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    let body: string | Buffer = readFileSync(target);
    if (target.endsWith('index.html')) body = body.toString().replace('__SDLC_TOKEN__', opts.token);
    return c.body(body as never, 200, { 'content-type': types[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  });

  return app;
}

export async function startServer(opts: ServerOptions): Promise<{ url: string; close: () => void }> {
  const token = randomBytes(16).toString('hex');
  const app = createApp({ root: opts.root, token });
  const port = opts.port ?? 4319;
  return new Promise((resolveStart) => {
    const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
      const url = `http://127.0.0.1:${info.port}/`;
      console.log(`sdlc dashboard: ${url}  (${opts.root})\nCtrl+C to stop.`);
      if (opts.open) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        execFile(opener, [url], () => {});
      }
      resolveStart({ url, close: () => server.close() });
    });
  });
}
