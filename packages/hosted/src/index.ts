// `sdlc hosted`: read-only org board over a GitHub App installation (docs/rfc/hosted.md, phase 1).
// No database: per-repo TTL cache, dropped by push webhooks. Access control is a viewer token or an SSO proxy.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { repoChanges, type RemoteChange } from './board.ts';
import { GithubClient } from './github.ts';

export { appJwt, GithubClient } from './github.ts';
export { repoChanges, type RemoteChange } from './board.ts';

export interface HostedEnv {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_PRIVATE_KEY_FILE?: string;
  GITHUB_INSTALLATION_ID?: string;
  GITHUB_API?: string;
  /** Viewers must send `Authorization: Bearer <token>` or `?token=`. Unset: rely on an SSO proxy. */
  SDLC_HOSTED_TOKEN?: string;
  /** GitHub App webhook secret (push events drop the repo's cache). */
  SDLC_HOSTED_WEBHOOK_SECRET?: string;
  /** Cache TTL in seconds (default 300). */
  SDLC_HOSTED_TTL?: string;
}

export interface OrgRepo {
  repo: string;
  defaultBranch: string;
  changes: RemoteChange[];
  error?: string;
}

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function client(env: HostedEnv): GithubClient {
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? (env.GITHUB_APP_PRIVATE_KEY_FILE ? readFileSync(env.GITHUB_APP_PRIVATE_KEY_FILE, 'utf8') : undefined);
  if (!env.GITHUB_APP_ID || !privateKey || !env.GITHUB_INSTALLATION_ID) {
    throw new Error('sdlc hosted needs GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (or _FILE) and GITHUB_INSTALLATION_ID');
  }
  return new GithubClient({ appId: env.GITHUB_APP_ID, privateKey, installationId: env.GITHUB_INSTALLATION_ID, api: env.GITHUB_API });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderBoard(repos: OrgRepo[]): string {
  const rows = repos
    .flatMap((r) =>
      r.error
        ? [`<tr><td>${esc(r.repo)}</td><td colspan="5" class="err">${esc(r.error)}</td></tr>`]
        : r.changes.map(
            (c) =>
              `<tr><td>${esc(r.repo)}</td><td><b>${esc(c.title ?? c.slug)}</b><br><small>${esc(c.dir)}${c.branch ? ` · ${esc(c.branch)}` : ''}</small></td>` +
              `<td><span class="stage ${esc(c.stage)}">${esc(c.stage)}</span></td><td><code>${esc(c.statuses)}</code></td>` +
              `<td>${c.waitingFor ? `${esc(c.waitingFor)} gate` : ''}</td><td>${esc(c.risk ?? '')}</td></tr>`,
          ),
    )
    .join('\n');
  const waiting = repos.flatMap((r) => r.changes).filter((c) => c.waitingFor).length;
  return `<!doctype html><html><head><meta charset="utf-8"><title>ai-sdlc · org board</title><style>
body{font:14px system-ui,sans-serif;margin:2rem;color:#1f2328}table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #d0d7de;padding:.5rem;text-align:left;vertical-align:top}small{color:#656d76}
.stage{padding:.1rem .4rem;border-radius:1rem;background:#eaeef2}.merged{background:#dafbe1}.building{background:#ddf4ff}.err{color:#cf222e}
</style></head><body><h1>Org board</h1><p>${repos.length} repositories · ${repos.reduce((n, r) => n + r.changes.length, 0)} changes · ${waiting} waiting for a gate</p>
<table><thead><tr><th>Repository</th><th>Change</th><th>Stage</th><th>intent/spec/plan</th><th>Waiting for</th><th>Risk</th></tr></thead><tbody>
${rows || '<tr><td colspan="6">No changes yet.</td></tr>'}</tbody></table></body></html>`;
}

export function createHostedApp(env: HostedEnv = process.env as HostedEnv, gh: GithubClient = client(env)): Hono {
  const ttl = Number(env.SDLC_HOSTED_TTL ?? 300) * 1000;
  const cache = new Map<string, { at: number; value: OrgRepo }>();
  let repoList: { at: number; value: { full_name: string; default_branch: string }[] } | undefined;

  async function board(): Promise<OrgRepo[]> {
    if (!repoList || Date.now() - repoList.at > ttl) {
      repoList = { at: Date.now(), value: (await gh.repos()).filter((r) => !r.archived) };
    }
    return Promise.all(
      repoList.value.map(async (r) => {
        const hit = cache.get(r.full_name);
        if (hit && Date.now() - hit.at <= ttl) return hit.value;
        let value: OrgRepo;
        try {
          value = { repo: r.full_name, defaultBranch: r.default_branch, changes: await repoChanges(gh, r.full_name, r.default_branch) };
        } catch (e) {
          value = { repo: r.full_name, defaultBranch: r.default_branch, changes: [], error: (e as Error).message };
        }
        cache.set(r.full_name, { at: Date.now(), value });
        return value;
      }),
    );
  }

  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/webhook', async (c) => {
    const raw = await c.req.text();
    const secret = env.SDLC_HOSTED_WEBHOOK_SECRET;
    if (!secret) return c.json({ error: 'SDLC_HOSTED_WEBHOOK_SECRET is not set' }, 503);
    const sig = c.req.header('x-hub-signature-256') ?? '';
    if (!equal(sig, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`)) return c.json({ error: 'bad signature' }, 401);
    const repo = (JSON.parse(raw) as { repository?: { full_name?: string } }).repository?.full_name;
    const event = c.req.header('x-github-event');
    if (event?.startsWith('installation')) repoList = undefined;
    if (repo) cache.delete(repo);
    return c.json({ invalidated: repo ?? null });
  });

  app.use('*', async (c, next) => {
    const token = env.SDLC_HOSTED_TOKEN;
    if (!token) return next();
    const given = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? c.req.query('token') ?? '';
    if (!equal(given, token)) return c.json({ error: 'unauthorized' }, 401);
    return next();
  });

  app.get('/api/org', async (c) => c.json({ repos: await board() }));
  app.get('/', async (c) => c.html(renderBoard(await board())));
  return app;
}

export async function startHosted(opts: { port?: number; env?: HostedEnv } = {}): Promise<void> {
  const { serve } = await import('@hono/node-server');
  const app = createHostedApp(opts.env);
  const port = opts.port ?? Number(process.env.PORT ?? 8788);
  serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, (info) => {
    console.log(`sdlc hosted: org board on :${info.port} (GET /, GET /api/org, POST /webhook)`);
  });
}
