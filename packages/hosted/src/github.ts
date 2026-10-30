// Minimal GitHub App client: app JWT → installation token → REST reads. Read-only (phase 1 of docs/rfc/hosted.md).
import { createSign } from 'node:crypto';

export interface GithubAppOptions {
  appId: string;
  privateKey: string;
  installationId: string;
  api?: string;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** RS256 JWT that authenticates as the app (valid 9 minutes; iat back-dated for clock skew). */
export function appJwt(appId: string, privateKey: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000) - 60;
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iat, exp: iat + 600, iss: appId }))}`;
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')}`;
}

export interface Repo {
  full_name: string;
  default_branch: string;
  archived?: boolean;
}

export interface Branch {
  name: string;
  commit: { sha: string };
}

export class GithubClient {
  private readonly opts: GithubAppOptions;
  private readonly api: string;
  private token?: { value: string; expires: number };

  constructor(opts: GithubAppOptions) {
    this.opts = opts;
    this.api = (opts.api ?? 'https://api.github.com').replace(/\/$/, '');
  }

  private async installationToken(): Promise<string> {
    if (this.token && this.token.expires - Date.now() > 60_000) return this.token.value;
    const r = await fetch(`${this.api}/app/installations/${this.opts.installationId}/access_tokens`, {
      method: 'POST',
      headers: { authorization: `Bearer ${appJwt(this.opts.appId, this.opts.privateKey)}`, accept: 'application/vnd.github+json' },
    });
    if (!r.ok) throw new Error(`installation token: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { token: string; expires_at: string };
    this.token = { value: j.token, expires: Date.parse(j.expires_at) };
    return j.token;
  }

  async request(path: string, accept = 'application/vnd.github+json'): Promise<Response> {
    const r = await fetch(`${this.api}${path}`, { headers: { authorization: `token ${await this.installationToken()}`, accept, 'x-github-api-version': '2022-11-28' } });
    if (!r.ok && r.status !== 404) throw new Error(`GET ${path}: HTTP ${r.status}`);
    return r;
  }

  async json<T>(path: string): Promise<T | undefined> {
    const r = await this.request(path);
    return r.status === 404 ? undefined : ((await r.json()) as T);
  }

  private async paged<T>(path: string, pick: (page: any) => T[]): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 50; page++) {
      const items = pick(await this.json(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`));
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  }

  repos(): Promise<Repo[]> {
    return this.paged('/installation/repositories', (p) => p?.repositories ?? []);
  }

  branches(repo: string): Promise<Branch[]> {
    return this.paged(`/repos/${repo}/branches`, (p) => p ?? []);
  }

  async tree(repo: string, sha: string): Promise<string[]> {
    const t = await this.json<{ tree: { path: string; type: string }[] }>(`/repos/${repo}/git/trees/${sha}?recursive=1`);
    return (t?.tree ?? []).filter((e) => e.type === 'blob').map((e) => e.path);
  }

  async file(repo: string, path: string, sha: string): Promise<string | undefined> {
    const r = await this.request(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, 'application/vnd.github.raw+json');
    return r.status === 404 ? undefined : r.text();
  }

  /** Files changed on `head` since it forked from `base`. */
  async changedFiles(repo: string, base: string, head: string): Promise<string[]> {
    const c = await this.json<{ files?: { filename: string }[] }>(`/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
    return (c?.files ?? []).map((f) => f.filename);
  }
}
