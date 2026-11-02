// `sdlc notify <event>`: post a loop event to the team's channel. Exit 0 even when the send fails (fail-open).
import {
  ARTIFACTS,
  currentBranch,
  isNotifyEvent,
  listChanges,
  localeOf,
  notify,
  notifyPayload,
  NOTIFY_EVENTS,
  type Artifact,
  type Change,
  type LoadedConfig,
  type Notice,
} from '@ai-native-sdlc/core';

/** The change a CI run is about: by id/slug, else by branch (`change/<slug>`), else the active one (unless `active: false`). */
export function findChange(root: string, loaded: LoadedConfig | undefined, o: { id?: string; branch?: string; active?: boolean }): Change | undefined {
  const all = listChanges(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch });
  if (o.id) return all.find((c) => c.id === o.id || c.slug === o.id || c.dir === o.id || c.id === `changes/${o.id}`);
  if (o.branch) {
    const slug = o.branch.replace(/^change\//, '');
    const hit = all.find((c) => c.branch === o.branch || c.slug === slug || c.dir === slug);
    if (hit) return hit;
  }
  return o.active === false ? undefined : all.find((c) => c.active);
}

export async function notifyCommand(root: string, loaded: LoadedConfig | undefined, pos: string[], flags: Record<string, string | true>): Promise<number> {
  const event = pos[0] ?? '';
  const str = (k: string) => (typeof flags[k] === 'string' ? (flags[k] as string) : undefined);
  if (!isNotifyEvent(event)) {
    process.stderr.write(
      `usage: sdlc notify <${NOTIFY_EVENTS.join('|')}> [--change ID] [--artifact intent|spec|plan] [--decision approved|rejected] [--by WHO] [-m NOTE] [--dry-run]\n`,
    );
    return 1;
  }
  const artifact = str('artifact');
  if (artifact && !ARTIFACTS.includes(artifact as Artifact)) {
    process.stderr.write(`sdlc notify: --artifact must be one of ${ARTIFACTS.join(', ')}\n`);
    return 1;
  }
  const decision = str('decision');
  const env = process.env;
  const change = findChange(root, loaded, { id: str('change'), branch: env.HEAD_REF || env.MERGED_BRANCH || currentBranch(root) });
  if (str('change') && !change) {
    process.stderr.write(`sdlc notify: no change '${str('change')}' (see sdlc status)\n`);
    return 1;
  }
  const n: Notice = {
    event,
    change,
    artifact: artifact as Artifact | undefined,
    decision: decision === 'approved' || decision === 'rejected' ? decision : undefined,
    by: str('by'),
    note: str('m'),
    prUrl: str('pr-url'),
  };
  if (flags['dry-run']) {
    console.log(JSON.stringify(notifyPayload(n, loaded, env), null, 2));
    return 0;
  }
  process.stderr.write(`[sdlc] ${await notify(n, loaded, env)}\n`);
  return 0;
}
