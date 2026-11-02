// Notifications: one message per loop event to Slack or any webhook (Teams, Discord, …).
// Fail-open: a missing webhook or a failed send is a log line, never an error.
import type { Change } from './changes.ts';
import { localeOf, NOTIFY_EVENTS, type Artifact, type LoadedConfig, type NotifyEvent } from './config.ts';
import { requiredApprovers } from './gates.ts';
import { t } from './i18n.ts';

export const DEFAULT_NOTIFY_ENV = 'SDLC_NOTIFY_WEBHOOK';

export const isNotifyEvent = (s: string): s is NotifyEvent => (NOTIFY_EVENTS as readonly string[]).includes(s);

export interface Notice {
  event: NotifyEvent;
  change?: Change;
  artifact?: Artifact;
  decision?: 'approved' | 'rejected';
  by?: string;
  /** Decision reason, review tally, or any extra line. */
  note?: string;
  prUrl?: string;
  /** Who has to act; default for gate.pending and spec.ready: the approvers of the artifact. */
  people?: string[];
}

export interface NoticeMessage {
  title: string;
  lines: string[];
  people: string[];
  links: { label: string; url: string }[];
}

/** Web URL of the PR/MR this CI run belongs to, from the provider's env. */
export function prUrlFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  if (env.PR_URL) return env.PR_URL;
  const n = env.PR_NUMBER ?? env.CI_MERGE_REQUEST_IID ?? env.BITBUCKET_PR_ID;
  if (!n) return undefined;
  if (env.GITHUB_REPOSITORY) return `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}/pull/${n}`;
  if (env.CI_PROJECT_URL) return `${env.CI_PROJECT_URL}/-/merge_requests/${n}`;
  if (env.BITBUCKET_GIT_HTTP_ORIGIN) return `${env.BITBUCKET_GIT_HTTP_ORIGIN}/pull-requests/${n}`;
  return undefined;
}

function fileUrl(env: NodeJS.ProcessEnv, ref: string, path: string): string | undefined {
  if (env.GITHUB_REPOSITORY) return `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}/blob/${ref}/${path}`;
  if (env.CI_PROJECT_URL) return `${env.CI_PROJECT_URL}/-/blob/${ref}/${path}`;
  if (env.BITBUCKET_GIT_HTTP_ORIGIN) return `${env.BITBUCKET_GIT_HTTP_ORIGIN}/src/${ref}/${path}`;
  return undefined;
}

export function noticeMessage(n: Notice, loaded: LoadedConfig | undefined, env: NodeJS.ProcessEnv = process.env): NoticeMessage {
  const locale = localeOf(loaded);
  const title0 = n.change?.title;
  const change = title0 && title0.toLowerCase() !== n.change!.slug ? `${n.change!.slug} (${title0})` : (n.change?.slug ?? '-');
  const artifact = n.artifact ?? n.change?.waitingFor ?? (n.event === 'spec.ready' ? 'spec' : undefined);
  const decision = n.decision ? t(locale, `nt.${n.decision}`) : '';
  const title = t(locale, `nt.${n.event}`, { change, artifact: artifact ?? '', decision, by: n.by ?? '' });
  let people = n.people;
  if (!people && n.change && artifact && (n.event === 'gate.pending' || n.event === 'spec.ready')) {
    const r = requiredApprovers(n.change, artifact, loaded);
    people = r.people.length ? r.people : r.roles;
  }
  const lines: string[] = [];
  if (n.change) lines.push(t(locale, 'nt.stage', { stage: n.change.stage }));
  if (people?.length) lines.push(t(locale, 'nt.who', { who: people.map((p) => mention(p, loaded)).join(', ') }));
  if (n.note) lines.push(n.note);
  const links: NoticeMessage['links'] = [];
  const pr = n.prUrl ?? prUrlFromEnv(env);
  if (pr) links.push({ label: 'PR', url: pr });
  const ref = n.change?.branch ?? env.HEAD_REF ?? env.MERGED_BRANCH;
  const path = artifact && n.change?.artifacts[artifact]?.path;
  const url = path && ref && n.event !== 'change.merged' ? fileUrl(env, ref, path) : undefined;
  if (url) links.push({ label: `${artifact}.md`, url });
  return { title, lines, people: people ?? [], links };
}

function mention(person: string, loaded: LoadedConfig | undefined): string {
  const people = loaded?.config.notify?.people ?? {};
  const id = people[person] ?? people[person.toLowerCase()];
  return id && (loaded?.config.notify?.format ?? 'slack') === 'slack' ? `<@${id}>` : person;
}

export function notifyPayload(n: Notice, loaded: LoadedConfig | undefined, env: NodeJS.ProcessEnv = process.env): unknown {
  const m = noticeMessage(n, loaded, env);
  if (notifyFormat(loaded, env) === 'slack') {
    const links = m.links.map((l) => `<${l.url}|${l.label}>`).join(' · ');
    return {
      text: m.title,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: [`*${m.title}*`, ...m.lines, links].filter(Boolean).join('\n') } }],
    };
  }
  const text = [m.title, ...m.lines, ...m.links.map((l) => `${l.label}: ${l.url}`)].join('\n');
  return {
    event: n.event,
    title: m.title,
    text,
    content: text,
    change: n.change && { id: n.change.id, slug: n.change.slug, stage: n.change.stage, ticket: n.change.ticket },
    artifact: n.artifact,
    decision: n.decision,
    by: n.by,
    people: m.people,
    links: m.links,
  };
}

export function notifyFormat(loaded: LoadedConfig | undefined, env: NodeJS.ProcessEnv = process.env): 'slack' | 'generic' {
  const f = loaded?.config.notify?.format;
  if (f) return f;
  return /hooks\.slack\.com/.test(notifyUrl(loaded, env) ?? '') ? 'slack' : 'generic';
}

export function notifyUrl(loaded: LoadedConfig | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[loaded?.config.notify?.webhook_env ?? DEFAULT_NOTIFY_ENV] || undefined;
}

/** Sends the notice if a webhook is configured and the event is enabled. Never throws; returns what happened. */
export async function notify(n: Notice, loaded: LoadedConfig | undefined, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const url = notifyUrl(loaded, env);
  if (!url) return `notify ${n.event}: off (${loaded?.config.notify?.webhook_env ?? DEFAULT_NOTIFY_ENV} not set)`;
  const events = loaded?.config.notify?.events;
  if (events && !events.includes(n.event)) return `notify ${n.event}: skipped (not in notify.events)`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(notifyPayload(n, loaded, env)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `notify ${n.event}: failed (HTTP ${res.status}; continuing)`;
    return `notify ${n.event}: sent`;
  } catch (e) {
    return `notify ${n.event}: failed (${(e as Error).message}; continuing)`;
  }
}
