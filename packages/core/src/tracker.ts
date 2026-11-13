// Trackers: Jira REST (Cloud and Data Center, API v2), GitHub Issues (REST) and Linear (GraphQL), behind one interface.
// Used in CI/headless runs and when no tracker MCP is available. Callers treat failures as warnings: the tracker never blocks the loop.
import type { LoadedConfig } from './config.ts';
import { git } from './git.ts';
import { basicAuth, httpJson, SdlcError } from './http.ts';

/** Exit code for "tracker not configured", distinct from a failure. */
export const TRACKER_DISABLED = 3;

export const TRACKER_PROVIDERS = ['jira', 'github', 'linear'] as const;
export type TrackerProvider = (typeof TRACKER_PROVIDERS)[number];

/** Loop stages a tracker can follow (`tracker.transitions` maps them to a transition, status, label or workflow state). */
export const TRACKER_STAGES = ['intent', 'spec', 'plan', 'ship', 'merged'] as const;

export interface Issue {
  key: string;
  summary: string;
  status: string;
  type: string;
  description: string | null;
  url: string;
  /** Where the status sits in the workflow, the same for every provider (set by search). */
  category?: IssueCategory;
  assignee?: string | null;
}

export type IssueCategory = 'todo' | 'in_progress' | 'done' | 'cancelled';

export interface SearchIssues {
  /** Free text (Jira `text ~`, GitHub search, Linear title or description). Empty: every issue of the project. */
  query?: string;
  /** Most recently updated first; default 200. */
  limit?: number;
}

export interface CreateIssue {
  summary: string;
  body: string;
  type?: string;
  parent?: string;
  labels?: string[];
}

export interface Transition {
  id: string;
  name: string;
  to: string;
}

export interface Tracker {
  provider: TrackerProvider;
  get(key: string): Promise<Issue>;
  transitions(key: string): Promise<Transition[]>;
  /** `target` is a loop stage (mapped in tracker.transitions) or a provider transition/status/label name. */
  transition(key: string, target: string): Promise<string>;
  comment(key: string, body: string): Promise<void>;
  /** `parent`: the epic's key (Jira parent or Epic Link, GitHub sub-issue, Linear parent issue). */
  create(o: CreateIssue): Promise<string>;
  /** Record that `blocker` blocks `blocked`. */
  link(blocker: string, blocked: string): Promise<void>;
  setDescription(key: string, body: string): Promise<void>;
  statuses(): Promise<string[]>;
  /** Read only: open and closed issues of the project, for checking a new request against what already exists. */
  search(o?: SearchIssues): Promise<Issue[]>;
}

const DEFAULT_SEARCH_LIMIT = 200;

export function trackerProvider(loaded: LoadedConfig | undefined): TrackerProvider | undefined {
  const p = loaded?.config.tracker?.provider;
  return (TRACKER_PROVIDERS as readonly string[]).includes(p ?? '') ? (p as TrackerProvider) : undefined;
}

export function trackerEnabled(loaded: LoadedConfig | undefined): boolean {
  return trackerProvider(loaded) !== undefined;
}

export function tracker(loaded: LoadedConfig | undefined, env: NodeJS.ProcessEnv = process.env, root = process.cwd()): Tracker {
  switch (trackerProvider(loaded)) {
    case 'jira':
      return jira(loaded, env);
    case 'github':
      return githubIssues(loaded!, env, root);
    case 'linear':
      return linear(loaded!, env);
    default:
      throw new SdlcError('tracker not configured (tracker.provider: jira | github | linear)', TRACKER_DISABLED);
  }
}

const isStage = (s: string) => (TRACKER_STAGES as readonly string[]).includes(s);

export function jira(loaded: LoadedConfig | undefined, env: NodeJS.ProcessEnv = process.env): Tracker {
  if (trackerProvider(loaded) !== 'jira') throw new SdlcError('tracker not configured (tracker.provider != jira)', TRACKER_DISABLED);
  const tracker = loaded!.config.tracker!;
  const base = (env.JIRA_BASE_URL ?? tracker.base_url ?? '').replace(/\/$/, '');
  if (!base) throw new SdlcError('missing tracker.base_url in .sdlc/config.json (or JIRA_BASE_URL)');
  const user = env.JIRA_EMAIL ?? env.JIRA_USER;
  const auth = env.JIRA_PAT ? `Bearer ${env.JIRA_PAT}` : user && env.JIRA_API_TOKEN ? basicAuth(user, env.JIRA_API_TOKEN) : undefined;
  if (!auth) throw new SdlcError('missing Jira credentials (JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT)');
  const call = (method: string, path: string, body?: unknown) => httpJson(method, `${base}/rest/api/2${path}`, { authorization: auth }, body);
  const projectKey = () => tracker.project_key ?? fail('missing tracker.project_key');

  return {
    provider: 'jira',
    async get(key) {
      const i = await call('GET', `/issue/${key}?fields=summary,status,issuetype,description`);
      return { key: i.key, summary: i.fields.summary, status: i.fields.status?.name, type: i.fields.issuetype?.name, description: i.fields.description ?? null, url: `${base}/browse/${i.key}` };
    },
    async transitions(key) {
      const r = await call('GET', `/issue/${key}/transitions`);
      return (r.transitions ?? []).map((t: any) => ({ id: t.id, name: t.name, to: t.to?.name }));
    },
    async transition(key, target) {
      const name = tracker.transitions?.[target] ?? target;
      const n = name.toLowerCase();
      const t = (await this.transitions(key)).find((x) => x.name.toLowerCase() === n || x.to?.toLowerCase() === n);
      if (!t) throw new SdlcError(`transition '${name}' is not available for ${key} from its current status (see: sdlc tracker transitions ${key})`);
      await call('POST', `/issue/${key}/transitions`, { transition: { id: t.id } });
      return `${key} → ${name}`;
    },
    async comment(key, body) {
      await call('POST', `/issue/${key}/comment`, { body });
    },
    async create(o) {
      const fields: Record<string, unknown> = {
        project: { key: projectKey() },
        summary: o.summary,
        description: o.body,
        issuetype: { name: o.type ?? tracker.default_issue_type ?? 'Task' },
      };
      if (o.labels?.length) fields.labels = o.labels.map((l) => l.replace(/\s+/g, '-'));
      // Cloud links any issue to its epic through `parent`; Data Center/Server needs the Epic Link custom field
      if (o.parent) fields[tracker.epic_link_field ?? 'parent'] = tracker.epic_link_field ? o.parent : { key: o.parent };
      const r = await call('POST', '/issue', { fields });
      return r.key;
    },
    async link(blocker, blocked) {
      await call('POST', '/issueLink', { type: { name: 'Blocks' }, inwardIssue: { key: blocker }, outwardIssue: { key: blocked } });
    },
    async setDescription(key, body) {
      await call('PUT', `/issue/${key}`, { fields: { description: body } });
    },
    async statuses() {
      const r = await call('GET', `/project/${projectKey()}/statuses`);
      return [...new Set<string>(r.flatMap((t: any) => t.statuses.map((s: any) => s.name)))].sort();
    },
    async search(o = {}) {
      const limit = o.limit ?? DEFAULT_SEARCH_LIMIT;
      const text = o.query?.trim() ? ` AND text ~ "${o.query.trim().replace(/["\\]/g, '\\$&')}"` : '';
      const jql = `project = "${projectKey()}"${text} ORDER BY updated DESC`;
      const fields = ['summary', 'status', 'issuetype', 'assignee'];
      const category: Record<string, IssueCategory> = { new: 'todo', indeterminate: 'in_progress', done: 'done' };
      const out: Issue[] = [];
      // Cloud pages /rest/api/3/search/jql with a token; Data Center only has /rest/api/2/search, paged by offset
      let cloud = true;
      let token: string | undefined;
      while (out.length < limit) {
        const maxResults = Math.min(100, limit - out.length);
        let r: any;
        if (cloud) {
          try {
            r = await httpJson('POST', `${base}/rest/api/3/search/jql`, { authorization: auth }, { jql, fields, maxResults, ...(token ? { nextPageToken: token } : {}) });
          } catch (e) {
            if (out.length || !/HTTP 404/.test((e as Error).message)) throw e;
            cloud = false;
            continue;
          }
        } else r = await call('POST', '/search', { jql, fields, maxResults, startAt: out.length });
        const issues: any[] = r?.issues ?? [];
        for (const i of issues) {
          out.push({
            key: i.key,
            summary: i.fields.summary,
            status: i.fields.status?.name,
            type: i.fields.issuetype?.name,
            description: null,
            url: `${base}/browse/${i.key}`,
            category: category[i.fields.status?.statusCategory?.key] ?? 'todo',
            assignee: i.fields.assignee?.displayName ?? null,
          });
        }
        token = r?.nextPageToken;
        if (!issues.length || (cloud ? !token || r.isLast : out.length >= (r.total ?? 0))) break;
      }
      return out.slice(0, limit);
    },
  };
}

/** `owner/repo` for GitHub Issues: tracker.repo, GITHUB_REPOSITORY, vcs.workspace/repo, or the origin remote. */
function githubRepo(loaded: LoadedConfig, env: NodeJS.ProcessEnv, root: string): string {
  const t = loaded.config.tracker as { repo?: string } | undefined;
  if (t?.repo) return t.repo;
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  const v = loaded.config.vcs;
  if (v?.workspace && v.repo) return `${v.workspace}/${v.repo}`;
  const m = /github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(git(root, ['remote', 'get-url', 'origin']) ?? '');
  return m?.[1] ?? fail('cannot tell the GitHub repository: set tracker.repo ("owner/repo")');
}

function githubIssues(loaded: LoadedConfig, env: NodeJS.ProcessEnv, root: string): Tracker {
  const tracker = loaded.config.tracker!;
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN ?? fail('missing GitHub credentials (GH_TOKEN or GITHUB_TOKEN)');
  const api = (env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
  const repo = githubRepo(loaded, env, root);
  const headers = { authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' };
  const call = (method: string, path: string, body?: unknown) => httpJson(method, `${api}/repos/${repo}${path}`, headers, body);
  const label = (stage: string) => tracker.transitions?.[stage] ?? `sdlc:${stage}`;
  const stageLabels = () => TRACKER_STAGES.map(label);
  const num = (key: string) => {
    const m = /^(?:[\w.-]+\/[\w.-]+)?#?(\d+)$/.exec(key.trim());
    return m ? m[1] : fail(`not a GitHub issue: ${key} (use #123 or owner/repo#123)`);
  };
  const toIssue = (i: any): Issue => {
    const labels: string[] = (i.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name));
    const stage = labels.find((l) => stageLabels().includes(l));
    return {
      key: `#${i.number}`,
      summary: i.title,
      status: i.state === 'closed' ? 'closed' : (stage ?? 'open'),
      type: labels.find((l) => !stageLabels().includes(l)) ?? 'issue',
      description: i.body ?? null,
      url: i.html_url,
    };
  };

  return {
    provider: 'github',
    async get(key) {
      return toIssue(await call('GET', `/issues/${num(key)}`));
    },
    async transitions() {
      return TRACKER_STAGES.map((s) => ({ id: label(s), name: s, to: label(s) }));
    },
    async transition(key, target) {
      const n = num(key);
      const to = isStage(target) ? label(target) : target;
      const current: string[] = ((await call('GET', `/issues/${n}`)).labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name));
      for (const old of current.filter((l) => l !== to && stageLabels().includes(l))) await call('DELETE', `/issues/${n}/labels/${encodeURIComponent(old)}`);
      await call('POST', `/issues/${n}/labels`, { labels: [to] });
      if (target === 'merged') await call('PATCH', `/issues/${n}`, { state: 'closed', state_reason: 'completed' });
      return `#${n} → ${to}${target === 'merged' ? ' (closed)' : ''}`;
    },
    async comment(key, body) {
      await call('POST', `/issues/${num(key)}/comments`, { body });
    },
    async create(o) {
      const type = o.type ?? tracker.default_issue_type;
      const labels = [...new Set([...(type ? [type] : []), ...(o.labels ?? [])])];
      const r = await call('POST', '/issues', { title: o.summary, body: o.body, labels });
      if (o.parent) {
        const epic = num(o.parent);
        try {
          await call('POST', `/issues/${epic}/sub_issues`, { sub_issue_id: r.id });
        } catch {
          // sub-issues unavailable (older GHES, plan): a task list in the epic links them instead
          const e = await call('GET', `/issues/${epic}`);
          await call('PATCH', `/issues/${epic}`, { body: `${e.body ?? ''}\n- [ ] #${r.number}`.trimStart() });
        }
      }
      return `#${r.number}`;
    },
    async link(blocker, blocked) {
      const n = num(blocked);
      const i = await call('GET', `/issues/${n}`);
      await call('PATCH', `/issues/${n}`, { body: `${i.body ?? ''}\n\nBlocked by #${num(blocker)}`.trimStart() });
    },
    async setDescription(key, body) {
      await call('PATCH', `/issues/${num(key)}`, { body });
    },
    async statuses() {
      return [...stageLabels(), 'closed'];
    },
    async search(o = {}) {
      const limit = o.limit ?? DEFAULT_SEARCH_LIMIT;
      const q = o.query?.trim();
      const out: Issue[] = [];
      for (let page = 1; out.length < limit; page++) {
        const items: any[] = q
          ? ((await httpJson('GET', `${api}/search/issues?q=${encodeURIComponent(`repo:${repo} is:issue ${q}`)}&sort=updated&per_page=100&page=${page}`, headers))?.items ?? [])
          : ((await call('GET', `/issues?state=all&sort=updated&per_page=100&page=${page}`)) ?? []);
        for (const i of items.filter((x) => !x.pull_request)) {
          const issue = toIssue(i);
          const started = issue.status !== 'open' && issue.status !== label('intent');
          issue.category = i.state === 'closed' ? (i.state_reason === 'not_planned' ? 'cancelled' : 'done') : started ? 'in_progress' : 'todo';
          issue.assignee = i.assignee?.login ?? null;
          issue.description = null;
          out.push(issue);
        }
        if (items.length < 100) break;
      }
      return out.slice(0, limit);
    },
  };
}

function linear(loaded: LoadedConfig, env: NodeJS.ProcessEnv): Tracker {
  const tracker = loaded.config.tracker as NonNullable<LoadedConfig['config']['tracker']> & { team_key?: string };
  const key = env.LINEAR_API_KEY ?? fail('missing Linear credentials (LINEAR_API_KEY)');
  const url = env.LINEAR_API_URL ?? 'https://api.linear.app/graphql';
  const teamKey = () => tracker.team_key ?? tracker.project_key ?? fail('missing tracker.team_key (the Linear team key, e.g. ENG)');
  const gql = async (query: string, variables: Record<string, unknown> = {}) => {
    const r = await httpJson('POST', url, { authorization: key }, { query, variables });
    if (r?.errors?.length) throw new SdlcError(`Linear: ${r.errors.map((e: any) => e.message).join('; ')}`);
    return r.data;
  };
  type Team = { id: string; states: { id: string; name: string }[] };
  let team: Promise<Team> | undefined;
  const getTeam = (): Promise<Team> =>
    (team ??= gql('query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id states { nodes { id name } } } } }', { key: teamKey() }).then((d) => {
      const t = d.teams.nodes[0] ?? fail(`no Linear team with key ${teamKey()}`);
      return { id: t.id, states: t.states.nodes };
    }));
  const issueId = async (k: string) => (await gql('query($id: String!) { issue(id: $id) { id } }', { id: k })).issue?.id ?? fail(`no Linear issue ${k}`);

  return {
    provider: 'linear',
    async get(k) {
      const d = await gql('query($id: String!) { issue(id: $id) { identifier title description url state { name } labels { nodes { name } } } }', { id: k });
      const i = d.issue ?? fail(`no Linear issue ${k}`);
      return { key: i.identifier, summary: i.title, status: i.state?.name, type: i.labels?.nodes?.[0]?.name ?? 'issue', description: i.description ?? null, url: i.url };
    },
    async transitions() {
      return (await getTeam()).states.map((s) => ({ id: s.id, name: s.name, to: s.name }));
    },
    async transition(k, target) {
      const name = tracker.transitions?.[target] ?? target;
      const s = (await getTeam()).states.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!s) throw new SdlcError(`workflow state '${name}' does not exist in team ${teamKey()} (see: sdlc tracker statuses)`);
      await gql('mutation($id: String!, $state: String!) { issueUpdate(id: $id, input: { stateId: $state }) { success } }', { id: await issueId(k), state: s.id });
      return `${k} → ${s.name}`;
    },
    async comment(k, body) {
      await gql('mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }', { id: await issueId(k), body });
    },
    async create(o) {
      const d = await gql(
        'mutation($team: String!, $title: String!, $body: String, $parent: String) { issueCreate(input: { teamId: $team, title: $title, description: $body, parentId: $parent }) { issue { identifier } } }',
        { team: (await getTeam()).id, title: o.summary, body: o.body, parent: o.parent ? await issueId(o.parent) : null },
      );
      return d.issueCreate.issue.identifier;
    },
    async link(blocker, blocked) {
      await gql('mutation($a: String!, $b: String!) { issueRelationCreate(input: { issueId: $a, relatedIssueId: $b, type: blocks }) { success } }', {
        a: await issueId(blocker),
        b: await issueId(blocked),
      });
    },
    async setDescription(k, body) {
      await gql('mutation($id: String!, $body: String!) { issueUpdate(id: $id, input: { description: $body }) { success } }', { id: await issueId(k), body });
    },
    async statuses() {
      return (await getTeam()).states.map((s) => s.name).sort();
    },
    async search(o = {}) {
      const limit = o.limit ?? DEFAULT_SEARCH_LIMIT;
      const q = o.query?.trim();
      const filter = { team: { key: { eq: teamKey() } }, ...(q ? { or: [{ title: { containsIgnoreCase: q } }, { description: { containsIgnoreCase: q } }] } : {}) };
      const category: Record<string, IssueCategory> = { started: 'in_progress', completed: 'done', canceled: 'cancelled' };
      const out: Issue[] = [];
      let after: string | null = null;
      while (out.length < limit) {
        const d: any = await gql(
          'query($filter: IssueFilter, $first: Int, $after: String) { issues(filter: $filter, first: $first, after: $after, orderBy: updatedAt) { nodes { identifier title url state { name type } labels { nodes { name } } assignee { name } } pageInfo { hasNextPage endCursor } } }',
          { filter, first: Math.min(100, limit - out.length), after },
        );
        for (const i of d.issues.nodes) {
          out.push({
            key: i.identifier,
            summary: i.title,
            status: i.state?.name,
            type: i.labels?.nodes?.[0]?.name ?? 'issue',
            description: null,
            url: i.url,
            category: category[i.state?.type] ?? 'todo',
            assignee: i.assignee?.name ?? null,
          });
        }
        if (!d.issues.pageInfo?.hasNextPage) break;
        after = d.issues.pageInfo.endCursor;
      }
      return out.slice(0, limit);
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

/**
 * Ticket keys for the configured tracker: `ENG-123` for Jira and Linear; `#123` / `owner/repo#123` for GitHub Issues.
 * GitHub's squash suffix `(#123)` is the PR number, not an issue, so it is skipped.
 */
export function trackerKeys(loaded: LoadedConfig | undefined, text: string): string[] {
  const t = loaded?.config.tracker as { project_key?: string; team_key?: string } | undefined;
  if (trackerProvider(loaded) !== 'github') return ticketKeys(text, trackerProvider(loaded) === 'linear' ? (t?.team_key ?? t?.project_key) : t?.project_key);
  const clean = text.replace(/\(#\d+\)\s*$/gm, '');
  const found = [...clean.matchAll(/(?:^|[\s(,:/-])((?:[\w.-]+\/[\w.-]+)?#(\d+))\b/g)].map((m) => m[1]);
  const branchIssue = /(?:^|\n)(?:change\/)?(?:issue-|gh-)(\d+)\b/.exec(clean)?.[1];
  return [...new Set([...found, ...(branchIssue ? [`#${branchIssue}`] : [])])].sort();
}
