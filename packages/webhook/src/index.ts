// `@claude` in GitLab MR and Bitbucket PR comments. Neither provider starts pipelines from comments, so this
// small service receives the comment webhook and triggers the project's pipeline, where `sdlc ci mention`
// runs the agent. The service holds no model credentials and no state: it only validates and forwards.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';

export interface WebhookEnv {
  /** Shared secret: GitLab "Secret token", Bitbucket webhook "Secret". Required. */
  SDLC_WEBHOOK_SECRET?: string;
  /** Mention that triggers the agent (default @claude). */
  SDLC_MENTION?: string;
  /** Comma-separated usernames allowed to trigger (default: anyone who can comment). */
  SDLC_ALLOWED_AUTHORS?: string;
  /** GitLab pipeline trigger token (Settings → CI/CD → Pipeline trigger tokens). */
  GITLAB_TRIGGER_TOKEN?: string;
  /** GitLab API base; default: the project's host + /api/v4. */
  GITLAB_API?: string;
  /** Bitbucket token with pipeline write access. */
  BITBUCKET_ACCESS_TOKEN?: string;
  BITBUCKET_API?: string;
  [key: string]: string | undefined;
}

export interface Mention {
  provider: 'gitlab' | 'bitbucket';
  /** GitLab project id or Bitbucket workspace/repo. */
  project: string;
  number: number;
  sourceBranch: string;
  targetBranch: string;
  author: string;
  body: string;
}

/** Our own replies carry this marker; never react to them (no loops). */
export const REPLY_MARKER = '(ai-sdlc)';
const BOT = /(\[bot\]|\bbot\b|ai-sdlc)/i;

export function mentions(body: string, mention = '@claude'): boolean {
  const m = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w@])${m}(?![\\w-])`, 'i').test(body) && !body.includes(REPLY_MARKER);
}

function allowed(env: WebhookEnv, author: string): boolean {
  if (BOT.test(author)) return false;
  const list = (env.SDLC_ALLOWED_AUTHORS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(author.toLowerCase());
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Pipeline variables `sdlc ci mention` reads (same names as the other `sdlc ci` commands). */
export function pipelineVariables(m: Mention): Record<string, string> {
  return {
    SDLC_JOB: 'mention',
    PR_NUMBER: String(m.number),
    BASE_REF: m.targetBranch,
    HEAD_REF: m.sourceBranch,
    SDLC_MENTION_AUTHOR: m.author,
    SDLC_MENTION_BODY: m.body.slice(0, 4000),
  };
}

async function post(url: string, init: RequestInit): Promise<void> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${init.method ?? 'POST'} ${url}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

export async function triggerGitlab(env: WebhookEnv, api: string, m: Mention): Promise<void> {
  if (!env.GITLAB_TRIGGER_TOKEN) throw new Error('GITLAB_TRIGGER_TOKEN is not set');
  const form = new URLSearchParams({ token: env.GITLAB_TRIGGER_TOKEN, ref: m.sourceBranch });
  for (const [k, v] of Object.entries(pipelineVariables(m))) form.set(`variables[${k}]`, v);
  await post(`${api}/projects/${encodeURIComponent(m.project)}/trigger/pipeline`, { method: 'POST', body: form });
}

export async function triggerBitbucket(env: WebhookEnv, m: Mention): Promise<void> {
  if (!env.BITBUCKET_ACCESS_TOKEN) throw new Error('BITBUCKET_ACCESS_TOKEN is not set');
  const api = env.BITBUCKET_API || 'https://api.bitbucket.org/2.0';
  await post(`${api}/repositories/${m.project}/pipelines/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.BITBUCKET_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      target: { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: m.sourceBranch, selector: { type: 'custom', pattern: 'sdlc-mention' } },
      variables: Object.entries(pipelineVariables(m)).map(([key, value]) => ({ key, value })),
    }),
  });
}

/** GitLab "Note Hook" on a merge request → Mention, or the reason it is ignored. */
export function gitlabMention(p: any, mention?: string): Mention | string {
  const note = p?.object_attributes;
  const mr = p?.merge_request;
  if (p?.object_kind !== 'note' || note?.noteable_type !== 'MergeRequest' || !mr) return 'not a merge request comment';
  if (!mentions(note.note ?? '', mention)) return 'no mention';
  return {
    provider: 'gitlab',
    project: String(p.project?.id ?? mr.target_project_id),
    number: Number(mr.iid),
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    author: p.user?.username ?? '',
    body: note.note,
  };
}

/** Bitbucket `pullrequest:comment_created` → Mention, or the reason it is ignored. */
export function bitbucketMention(p: any, mention?: string): Mention | string {
  const pr = p?.pullrequest;
  const body = p?.comment?.content?.raw ?? '';
  if (!pr || !p?.comment) return 'not a pull request comment';
  if (!mentions(body, mention)) return 'no mention';
  return {
    provider: 'bitbucket',
    project: p.repository?.full_name ?? '',
    number: Number(pr.id),
    sourceBranch: pr.source?.branch?.name,
    targetBranch: pr.destination?.branch?.name,
    author: p.actor?.nickname ?? p.actor?.username ?? p.actor?.display_name ?? '',
    body,
  };
}

export function createWebhookApp(env: WebhookEnv = process.env as WebhookEnv) {
  const app = new Hono();
  const secret = env.SDLC_WEBHOOK_SECRET;
  if (!secret) throw new Error('SDLC_WEBHOOK_SECRET is required');

  const accept = async (m: Mention | string, trigger: (m: Mention) => Promise<void>) => {
    if (typeof m === 'string') return { status: 200 as const, body: { ignored: m } };
    if (!allowed(env, m.author)) return { status: 200 as const, body: { ignored: `author ${m.author} not allowed` } };
    await trigger(m);
    return { status: 202 as const, body: { triggered: `${m.provider} ${m.project} #${m.number}` } };
  };

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/gitlab', async (c) => {
    if (!safeEqual(c.req.header('x-gitlab-token') ?? '', secret)) return c.json({ error: 'bad token' }, 401);
    if (c.req.header('x-gitlab-event') !== 'Note Hook') return c.json({ ignored: 'event' });
    const p = await c.req.json();
    const api = env.GITLAB_API || (p?.project?.web_url ? `${new URL(p.project.web_url).origin}/api/v4` : '');
    try {
      const r = await accept(gitlabMention(p, env.SDLC_MENTION), (m) => triggerGitlab(env, api, m));
      return c.json(r.body, r.status);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  app.post('/bitbucket', async (c) => {
    const raw = await c.req.text();
    const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    if (!safeEqual(c.req.header('x-hub-signature') ?? '', expected)) return c.json({ error: 'bad signature' }, 401);
    if (c.req.header('x-event-key') !== 'pullrequest:comment_created') return c.json({ ignored: 'event' });
    try {
      const r = await accept(bitbucketMention(JSON.parse(raw), env.SDLC_MENTION), (m) => triggerBitbucket(env, m));
      return c.json(r.body, r.status);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  return app;
}

export async function startWebhook(opts: { port?: number; env?: WebhookEnv } = {}): Promise<void> {
  const { serve } = await import('@hono/node-server');
  const app = createWebhookApp(opts.env);
  const port = opts.port ?? Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, (info) => {
    console.log(`sdlc webhook: listening on :${info.port} (POST /gitlab, POST /bitbucket, GET /health)`);
  });
}
