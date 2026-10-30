// `sdlc vcs …` and `sdlc tracker …`: same arguments and output as the original vcs.sh / tracker.sh,
// so skills and CI written against them keep working.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  jira,
  loadConfig,
  prChecks,
  prComment,
  prComments,
  prCreate,
  prCurrent,
  SdlcError,
  trackerEnabled,
  vcsProvider,
  type VcsContext,
} from '@ai-native-sdlc/core';

const VCS_HELP = `sdlc vcs provider                                            → github | gitlab | bitbucket
sdlc vcs pr-create --title T --body-file F [--base B] [--draft]  → PR URL
sdlc vcs pr-current                                          → {"number","url","state"} for the current branch
sdlc vcs pr-comment <number> --body-file F
sdlc vcs pr-comments <number>                                → review comments (JSON lines)
sdlc vcs pr-checks <number>                                  → name<TAB>state per line
Bitbucket auth: BITBUCKET_ACCESS_TOKEN, or BITBUCKET_USER + BITBUCKET_API_TOKEN.`;

const TRACKER_HELP = `sdlc tracker enabled                                → exit 0 if tracker.provider = jira
sdlc tracker get KEY                                → {"key","summary","status","type","description","url"}
sdlc tracker transitions KEY                        → available transitions, one per line
sdlc tracker transition KEY <stage|name>            → stage = intent|spec|plan|ship|merged (tracker.transitions)
sdlc tracker comment KEY --body-file F
sdlc tracker create --summary S --body-file F [--type T]  → new key
sdlc tracker set-description KEY --body-file F
sdlc tracker statuses                               → project workflow statuses
Auth: JIRA_EMAIL + JIRA_API_TOKEN (Cloud) or JIRA_PAT (Data Center). Exit 3 = tracker not configured.`;

/** --flag value pairs and bare flags, in any order after the positional arguments. */
function opts(args: string[]) {
  const pos: string[] = [];
  const o: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) pos.push(a);
    else if (a === '--draft') o.draft = true;
    else if (i + 1 < args.length) o[a.slice(2)] = args[++i];
    else throw new SdlcError(`missing value for ${a}`);
  }
  return { pos, o };
}

function bodyFile(o: Record<string, string | true>, cwd: string): { path: string; body: string } {
  const f = o['body-file'];
  if (typeof f !== 'string' || !existsSync(resolve(cwd, f))) throw new SdlcError('missing --body-file <file>');
  const path = resolve(cwd, f);
  return { path, body: readFileSync(path, 'utf8') };
}

function number(s: string | undefined, usage: string): number {
  if (!s || !/^\d+$/.test(s)) throw new SdlcError(`usage: ${usage}`);
  return Number(s);
}

export async function vcsCommand(root: string, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const ctx: VcsContext = { root, loaded: loadConfig(root) };
  const { pos, o } = opts(rest);
  switch (sub) {
    case 'provider':
      console.log(vcsProvider(ctx));
      return 0;
    case 'pr-create': {
      if (typeof o.title !== 'string') throw new SdlcError('usage: pr-create --title T --body-file F [--base B] [--draft]');
      const f = bodyFile(o, process.cwd());
      console.log(await prCreate(ctx, { title: o.title, body: f.body, base: typeof o.base === 'string' ? o.base : undefined, draft: o.draft === true }));
      return 0;
    }
    case 'pr-current': {
      const pr = await prCurrent(ctx);
      if (pr) console.log(JSON.stringify(pr));
      return 0;
    }
    case 'pr-comment':
      console.log(await prComment(ctx, number(pos[0], 'pr-comment <number> --body-file F'), bodyFile(o, process.cwd()).body));
      return 0;
    case 'pr-comments':
      for (const c of await prComments(ctx, number(pos[0], 'pr-comments <number>'))) console.log(JSON.stringify(c));
      return 0;
    case 'pr-checks':
      for (const c of await prChecks(ctx, number(pos[0], 'pr-checks <number>'))) console.log(`${c.name}\t${c.state}`);
      return 0;
    default:
      console.error(VCS_HELP);
      return 1;
  }
}

export async function trackerCommand(root: string, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const loaded = loadConfig(root);
  if (sub === 'enabled') return trackerEnabled(loaded) ? 0 : 1;
  const { pos, o } = opts(rest);
  const need = (usage: string) => pos[0] ?? fail(`usage: ${usage}`);
  switch (sub) {
    case 'get':
      console.log(JSON.stringify(await jira(loaded).get(need('get KEY'))));
      return 0;
    case 'transitions':
      for (const t of await jira(loaded).transitions(need('transitions KEY'))) console.log(`${t.name}\t→ ${t.to}`);
      return 0;
    case 'transition':
      if (!pos[1]) fail('usage: transition KEY <stage|name>');
      console.log(await jira(loaded).transition(pos[0], pos[1]));
      return 0;
    case 'comment':
      await jira(loaded).comment(need('comment KEY --body-file F'), bodyFile(o, process.cwd()).body);
      console.log(`comment added on ${pos[0]}`);
      return 0;
    case 'create':
      if (typeof o.summary !== 'string') fail('usage: create --summary S --body-file F [--type T]');
      console.log(await jira(loaded).create({ summary: o.summary as string, body: bodyFile(o, process.cwd()).body, type: typeof o.type === 'string' ? o.type : undefined }));
      return 0;
    case 'set-description':
      await jira(loaded).setDescription(need('set-description KEY --body-file F'), bodyFile(o, process.cwd()).body);
      console.log(`description updated on ${pos[0]}`);
      return 0;
    case 'statuses':
      for (const s of await jira(loaded).statuses()) console.log(s);
      return 0;
    default:
      console.error(TRACKER_HELP);
      return 1;
  }
}

function fail(msg: string): never {
  throw new SdlcError(msg);
}
