// PR/MR abstraction over GitHub (gh), GitLab (glab, or REST in CI) and Bitbucket Cloud (REST).
import { execFileSync } from 'node:child_process';
import type { LoadedConfig } from './config.ts';
import { currentBranch, git } from './git.ts';
import { basicAuth, hasTool, httpJson, runTool, SdlcError } from './http.ts';

export type Provider = 'github' | 'gitlab' | 'bitbucket';

export function detectProvider(root: string, loaded?: LoadedConfig): Provider | undefined {
  const p = loaded?.config.vcs?.provider;
  if (p) return p;
  const url = git(root, ['remote', 'get-url', 'origin']) ?? '';
  if (url.includes('github')) return 'github';
  if (url.includes('gitlab')) return 'gitlab';
  if (url.includes('bitbucket')) return 'bitbucket';
  return undefined;
}

export interface PullRequest {
  number: number;
  url: string;
  state: 'open' | 'merged' | 'closed' | 'draft';
  title?: string;
}

function run(cmd: string, args: string[], cwd: string): string | undefined {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 });
  } catch {
    return undefined;
  }
}

/** PR/MR for a branch, using gh/glab when installed and authenticated. Undefined when unknown. Used by the dashboard. */
export function prForBranch(root: string, branch: string, loaded?: LoadedConfig): PullRequest | undefined {
  const provider = detectProvider(root, loaded);
  if (provider === 'github') {
    const out = run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,url,state,isDraft,title', '--limit', '1'], root);
    const pr = out ? (JSON.parse(out) as { number: number; url: string; state: string; isDraft: boolean; title: string }[])[0] : undefined;
    if (!pr) return undefined;
    const state = pr.state === 'MERGED' ? 'merged' : pr.state === 'CLOSED' ? 'closed' : pr.isDraft ? 'draft' : 'open';
    return { number: pr.number, url: pr.url, state, title: pr.title };
  }
  if (provider === 'gitlab') {
    const out = run('glab', ['mr', 'list', '--source-branch', branch, '--all', '-F', 'json'], root);
    const mr = out ? (JSON.parse(out) as { iid: number; web_url: string; state: string; draft?: boolean; title: string }[])[0] : undefined;
    if (!mr) return undefined;
    const state = mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : mr.draft ? 'draft' : 'open';
    return { number: mr.iid, url: mr.web_url, state, title: mr.title };
  }
  return undefined;
}

// ---------- writes and CI lookups ----------

export interface VcsContext {
  root: string;
  loaded?: LoadedConfig;
  env?: NodeJS.ProcessEnv;
}

/** As reported by the provider (lowercased), e.g. open / opened / merged. */
export interface PrRef {
  number: number;
  url: string;
  state: string;
}

export interface PrComment {
  author: string;
  body: string;
  path: string | null;
  resolved: boolean;
}

export interface PrCheck {
  name: string;
  state: string;
}

export function vcsProvider(ctx: VcsContext): Provider {
  const p = detectProvider(ctx.root, ctx.loaded);
  if (!p) throw new SdlcError('could not determine the VCS provider (set vcs.provider in .sdlc/config.json)');
  return p;
}

function bitbucket(ctx: VcsContext) {
  const env = ctx.env ?? process.env;
  let auth: string;
  if (env.BITBUCKET_ACCESS_TOKEN) auth = `Bearer ${env.BITBUCKET_ACCESS_TOKEN}`;
  else if (env.BITBUCKET_USER && env.BITBUCKET_API_TOKEN) auth = basicAuth(env.BITBUCKET_USER, env.BITBUCKET_API_TOKEN);
  else throw new SdlcError('missing Bitbucket credentials (BITBUCKET_ACCESS_TOKEN, or BITBUCKET_USER + BITBUCKET_API_TOKEN)');
  let { workspace, repo } = ctx.loaded?.config.vcs ?? {};
  if (!workspace || !repo) {
    const m = /bitbucket\.org[:/]([^/]+)\/(.+?)(\.git)?$/.exec(git(ctx.root, ['remote', 'get-url', 'origin']) ?? '');
    workspace ??= m?.[1];
    repo ??= m?.[2];
  }
  if (!workspace || !repo) throw new SdlcError('could not determine the Bitbucket workspace/repo (vcs.workspace, vcs.repo)');
  const base = `${env.BITBUCKET_API ?? 'https://api.bitbucket.org/2.0'}/repositories/${workspace}/${repo}`;
  return (method: string, path: string, body?: unknown) => httpJson(method, base + path, { authorization: auth }, body);
}

const tool = (ctx: VcsContext, cmd: string, args: string[]) => runTool(cmd, args, ctx.root, ctx.env);
const branchOf = (ctx: VcsContext) => currentBranch(ctx.root) ?? 'HEAD';
const defaultBranch = (ctx: VcsContext) => ctx.loaded?.config.vcs?.default_branch ?? 'main';

export async function prCreate(ctx: VcsContext, o: { title: string; body: string; base?: string; head?: string; draft?: boolean }): Promise<string> {
  const base = o.base ?? defaultBranch(ctx);
  const head = o.head ?? branchOf(ctx);
  switch (vcsProvider(ctx)) {
    case 'github':
      return tool(ctx, 'gh', ['pr', 'create', '--title', o.title, '--body', o.body, '--base', base, '--head', head, ...(o.draft ? ['--draft'] : [])]);
    case 'gitlab':
      return tool(ctx, 'glab', ['mr', 'create', '--title', o.draft ? `Draft: ${o.title}` : o.title, '--description', o.body, '--source-branch', head, '--target-branch', base, '--yes']);
    case 'bitbucket': {
      const pr = await bitbucket(ctx)('POST', '/pullrequests', {
        title: o.title,
        description: o.body,
        source: { branch: { name: head } },
        destination: { branch: { name: base } },
        draft: !!o.draft,
      });
      return pr.links.html.href;
    }
  }
}

export async function prCurrent(ctx: VcsContext): Promise<PrRef | undefined> {
  const head = branchOf(ctx);
  switch (vcsProvider(ctx)) {
    case 'github': {
      const pr = JSON.parse(tool(ctx, 'gh', ['pr', 'view', head, '--json', 'number,url,state']) || 'null');
      return pr ? { number: pr.number, url: pr.url, state: String(pr.state).toLowerCase() } : undefined;
    }
    case 'gitlab': {
      const mr = JSON.parse(tool(ctx, 'glab', ['mr', 'view', head, '-F', 'json']) || 'null');
      return mr ? { number: mr.iid, url: mr.web_url, state: String(mr.state).toLowerCase() } : undefined;
    }
    case 'bitbucket': {
      const q = encodeURIComponent(`source.branch.name="${head}" AND state="OPEN"`);
      const pr = (await bitbucket(ctx)('GET', `/pullrequests?q=${q}`)).values?.[0];
      return pr ? { number: pr.id, url: pr.links.html.href, state: String(pr.state).toLowerCase() } : undefined;
    }
  }
}

export async function prComment(ctx: VcsContext, n: number, body: string): Promise<string> {
  const env = ctx.env ?? process.env;
  switch (vcsProvider(ctx)) {
    case 'github':
      return tool(ctx, 'gh', ['pr', 'comment', String(n), '--body', body]);
    case 'gitlab':
      if (hasTool('glab', env)) return tool(ctx, 'glab', ['mr', 'note', String(n), '--message', body]);
      // CI without glab: REST with a project/personal access token
      if (!env.GITLAB_TOKEN || !env.CI_API_V4_URL || !env.CI_PROJECT_ID) throw new SdlcError('without glab, GITLAB_TOKEN, CI_API_V4_URL and CI_PROJECT_ID are required');
      await httpJson('POST', `${env.CI_API_V4_URL}/projects/${env.CI_PROJECT_ID}/merge_requests/${n}/notes`, { 'private-token': env.GITLAB_TOKEN }, { body });
      return `comment posted on MR !${n}`;
    case 'bitbucket':
      await bitbucket(ctx)('POST', `/pullrequests/${n}/comments`, { content: { raw: body } });
      return `comment posted on PR #${n}`;
  }
}

export async function prComments(ctx: VcsContext, n: number): Promise<PrComment[]> {
  switch (vcsProvider(ctx)) {
    case 'github':
      return tool(ctx, 'gh', ['api', `repos/{owner}/{repo}/pulls/${n}/comments`, '--paginate', '--jq', '.[] | {author: .user.login, body, path, resolved: false}'])
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    case 'gitlab': {
      const discussions = JSON.parse(tool(ctx, 'glab', ['api', `projects/:id/merge_requests/${n}/discussions`]) || '[]');
      return discussions.flatMap((d: any) =>
        (d.notes ?? []).filter((x: any) => !x.system).map((x: any) => ({ author: x.author?.username, body: x.body, path: x.position?.new_path ?? null, resolved: !!x.resolved })),
      );
    }
    case 'bitbucket': {
      const page = await bitbucket(ctx)('GET', `/pullrequests/${n}/comments?pagelen=100`);
      return (page.values ?? [])
        .filter((c: any) => !c.deleted)
        .map((c: any) => ({ author: c.user?.display_name, body: c.content?.raw, path: c.inline?.path ?? null, resolved: c.resolution != null }));
    }
  }
}

export async function prChecks(ctx: VcsContext, n: number): Promise<PrCheck[]> {
  switch (vcsProvider(ctx)) {
    case 'github':
      return JSON.parse(tool(ctx, 'gh', ['pr', 'checks', String(n), '--json', 'name,state']) || '[]').map((c: any) => ({ name: c.name, state: String(c.state).toLowerCase() }));
    case 'gitlab': {
      const p = JSON.parse(tool(ctx, 'glab', ['api', `projects/:id/merge_requests/${n}/pipelines`]) || '[]')[0];
      return p ? [{ name: `pipeline ${p.id}`, state: p.status }] : [];
    }
    case 'bitbucket': {
      const page = await bitbucket(ctx)('GET', `/pullrequests/${n}/statuses`);
      return (page.values ?? []).map((s: any) => ({ name: s.name ?? s.key, state: String(s.state).toLowerCase() }));
    }
  }
}
