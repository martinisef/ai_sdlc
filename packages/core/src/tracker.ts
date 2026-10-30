// Jira REST (Cloud and Data Center, API v2). Used in CI/headless runs and when the Atlassian MCP is not available.
// Callers treat failures as warnings: the tracker never blocks the loop.
import type { LoadedConfig } from './config.ts';
import { basicAuth, httpJson, SdlcError } from './http.ts';

/** Exit code for "tracker not configured", distinct from a failure. */
export const TRACKER_DISABLED = 3;

export interface Issue {
  key: string;
  summary: string;
  status: string;
  type: string;
  description: string | null;
  url: string;
}

export function trackerEnabled(loaded: LoadedConfig | undefined): boolean {
  return loaded?.config.tracker?.provider === 'jira';
}

export function jira(loaded: LoadedConfig | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!trackerEnabled(loaded)) throw new SdlcError('tracker not configured (tracker.provider != jira)', TRACKER_DISABLED);
  const tracker = loaded!.config.tracker!;
  const base = (env.JIRA_BASE_URL ?? tracker.base_url ?? '').replace(/\/$/, '');
  if (!base) throw new SdlcError('missing tracker.base_url in .sdlc/config.json (or JIRA_BASE_URL)');
  const user = env.JIRA_EMAIL ?? env.JIRA_USER;
  const auth = env.JIRA_PAT ? `Bearer ${env.JIRA_PAT}` : user && env.JIRA_API_TOKEN ? basicAuth(user, env.JIRA_API_TOKEN) : undefined;
  if (!auth) throw new SdlcError('missing Jira credentials (JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT)');
  const call = (method: string, path: string, body?: unknown) => httpJson(method, `${base}/rest/api/2${path}`, { authorization: auth }, body);
  const projectKey = () => tracker.project_key ?? fail('missing tracker.project_key');

  return {
    async get(key: string): Promise<Issue> {
      const i = await call('GET', `/issue/${key}?fields=summary,status,issuetype,description`);
      return { key: i.key, summary: i.fields.summary, status: i.fields.status?.name, type: i.fields.issuetype?.name, description: i.fields.description ?? null, url: `${base}/browse/${i.key}` };
    },
    async transitions(key: string): Promise<{ id: string; name: string; to: string }[]> {
      const r = await call('GET', `/issue/${key}/transitions`);
      return (r.transitions ?? []).map((t: any) => ({ id: t.id, name: t.name, to: t.to?.name }));
    },
    /** `target` is a loop stage (intent|spec|plan|ship|merged, mapped in tracker.transitions) or a transition/status name. */
    async transition(key: string, target: string): Promise<string> {
      const name = tracker.transitions?.[target] ?? target;
      const n = name.toLowerCase();
      const t = (await this.transitions(key)).find((x) => x.name.toLowerCase() === n || x.to?.toLowerCase() === n);
      if (!t) throw new SdlcError(`transition '${name}' is not available for ${key} from its current status (see: sdlc tracker transitions ${key})`);
      await call('POST', `/issue/${key}/transitions`, { transition: { id: t.id } });
      return `${key} → ${name}`;
    },
    async comment(key: string, body: string): Promise<void> {
      await call('POST', `/issue/${key}/comment`, { body });
    },
    async create(o: { summary: string; body: string; type?: string }): Promise<string> {
      const r = await call('POST', '/issue', {
        fields: { project: { key: projectKey() }, summary: o.summary, description: o.body, issuetype: { name: o.type ?? tracker.default_issue_type ?? 'Task' } },
      });
      return r.key;
    },
    async setDescription(key: string, body: string): Promise<void> {
      await call('PUT', `/issue/${key}`, { fields: { description: body } });
    },
    async statuses(): Promise<string[]> {
      const r = await call('GET', `/project/${projectKey()}/statuses`);
      return [...new Set<string>(r.flatMap((t: any) => t.statuses.map((s: any) => s.name)))].sort();
    },
  };
}

function fail(msg: string): never {
  throw new SdlcError(msg);
}

/** Ticket keys mentioned in free text (commit messages, branch names). */
export function ticketKeys(text: string, projectKey?: string): string[] {
  const re = new RegExp(`${projectKey ? projectKey.replace(/[^A-Z0-9]/gi, '') : '[A-Z][A-Z0-9]+'}-[0-9]+`, 'g');
  return [...new Set(text.match(re) ?? [])].sort();
}
