// `sdlc roadmap …`: a technical plan → epics and stories (changes/_roadmaps/<slug>/roadmap.md) → tickets.
// The agent drafts the file (/sdlc-roadmap); a person approves it; `apply` creates what is missing in the tracker.
import {
  applyRoadmap,
  approvalHolds,
  checkRoadmap,
  decideRoadmap,
  discoveryRoadmap,
  findRoadmapItem,
  getRoadmap,
  listRoadmaps,
  loadConfig,
  loadDiscovery,
  localeOf,
  newRoadmap,
  roadmapStatus,
  SdlcError,
  setFrontmatter,
  tracker,
  trackerEnabled,
  TRACKER_DISABLED,
  validateDiscovery,
  type LoadedConfig,
} from '@ai-native-sdlc/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const ROADMAP_HELP = `sdlc roadmap new <slug> --source <file.pdf|file.md|url> [--title T]   scaffold changes/_roadmaps/<slug>/
sdlc roadmap new <slug> --from-discovery [topic…] [--title T]       draft it from the discovery features ready to build (experimental)
sdlc roadmap check <slug> [--json]               structure, dependencies, open questions (exit 1 on errors)
sdlc roadmap approve|reject <slug> [-m comment]  a person decides; approving needs a roadmap that passes the check
sdlc roadmap apply <slug> [--dry-run]            create the missing epics, stories and links in the tracker
sdlc roadmap status [<slug>] [--json]            each story: ticket, change, stage, what blocks it
sdlc roadmap find <KEY>                          the roadmap item behind a ticket (JSON), for /sdlc-intent
sdlc roadmap list                                roadmaps and their status`;

type Flags = Record<string, string | true>;

export async function roadmapCommand(root: string, pos: string[], flags: Flags): Promise<number> {
  const [sub, arg] = pos;
  const loaded = loadConfig(root);
  const need = (usage: string) => arg ?? fail(`usage: sdlc roadmap ${usage}`);
  switch (sub) {
    case 'new': {
      const slug = need('new <slug> --source <file|url>');
      if (flags['from-discovery']) return fromDiscovery(root, loaded, slug, pos.slice(2), str(flags.title));
      const r = await newRoadmap(root, slug, { source: str(flags.source), title: str(flags.title), loaded });
      console.log(`created ${r.path}${r.source ? ` (source: ${r.source}${r.sourceUrl ? `, downloaded from ${r.sourceUrl}` : ''})` : ''}`);
      console.log(`Next: /sdlc-roadmap ${slug} in your agent: it reads the document, asks what is missing and drafts the epics and stories.`);
      return 0;
    }
    case 'check': {
      const r = getRoadmap(root, need('check <slug>'));
      const c = checkRoadmap(r);
      if (flags.json) console.log(JSON.stringify({ roadmap: r.slug, status: r.data.status || 'draft', ...c }, null, 2));
      else {
        for (const e of c.errors) console.log(`✗ ${e}`);
        for (const w of c.warnings) console.log(`! ${w}`);
        console.log(`${c.errors.length ? '✗' : '✓'} ${r.path}: ${count(c.epics, 'epic')}, ${count(c.stories, 'story', 'stories')}, ${count(c.open, 'open question')}${c.errors.length ? `, ${count(c.errors.length, 'problem')}` : ''}`);
      }
      return c.errors.length ? 1 : 0;
    }
    case 'approve':
    case 'reject': {
      const slug = need(`${sub} <slug> [-m comment]`);
      const d = decideRoadmap(root, loaded, slug, sub === 'approve' ? 'approved' : 'rejected', { comment: str(flags.m) });
      const r = getRoadmap(root, d.slug);
      console.log(`${r.path} ${d.decision} by ${d.by} (${d.commit})`);
      if (d.decision === 'approved') {
        const missing = r.items.filter((i) => !i.fields.key).length;
        console.log(
          trackerEnabled(loaded)
            ? `Next: sdlc roadmap apply ${d.slug} creates ${missing} tickets (--dry-run shows them first).`
            : `No tracker configured: the roadmap is the plan. Start each story with /sdlc-intent "<story title>".`,
        );
      }
      return 0;
    }
    case 'apply': {
      const slug = need('apply <slug> [--dry-run]');
      const dryRun = !!flags['dry-run'];
      const holds = approvalHolds(getRoadmap(root, slug));
      if (!holds.ok) throw new SdlcError(holds.reason!);
      if (!dryRun && !trackerEnabled(loaded))
        throw new SdlcError('tracker not configured (tracker.provider: jira | github | linear): the roadmap stays as the plan; start each story with /sdlc-intent "<story title>"', TRACKER_DISABLED);
      const res = await applyRoadmap(root, loaded, slug, { dryRun, tracker: () => tracker(loaded, process.env, root) });
      if (!res.actions.length) {
        console.log('nothing to do: every item has its ticket and every link exists');
        return 0;
      }
      for (const a of res.actions) {
        const what = a.kind === 'link' ? `link     ${a.summary}` : `${a.kind === 'create-epic' ? 'epic ' : 'story'}    ${a.id} ${a.summary}`;
        console.log(dryRun ? `would create ${what}` : `${a.key ? `${a.key.padEnd(10)}` : 'skipped   '} ${what}`);
      }
      console.log(dryRun ? `${res.actions.length} action(s); run without --dry-run to create them.` : `${res.created} tickets created, ${res.linked} links${res.commit ? ` (keys saved in ${res.commit})` : ''}`);
      if (!dryRun) console.log('Next: sdlc next suggests the first story to start (/sdlc-intent <KEY>).');
      return 0;
    }
    case 'status': {
      const list = roadmapStatus(root, loaded, arg);
      if (flags.json) {
        console.log(JSON.stringify(list, null, 2));
        return 0;
      }
      if (!list.length) console.log('No roadmaps yet: sdlc roadmap new <slug> --source <file|url>.');
      let current = '';
      for (const s of list) {
        if (s.roadmap !== current) console.log(`${(current = s.roadmap)}`);
        const state = s.change ? `${s.stage}` : s.blockedBy.length ? `blocked by ${s.blockedBy.join(', ')}` : s.key ? 'ready' : 'no ticket';
        console.log(`  ${s.id.padEnd(7)} ${(s.key ?? '-').padEnd(10)} ${state.padEnd(24)} ${s.title}`);
      }
      return 0;
    }
    case 'find': {
      const key = need('find <KEY>');
      const f = findRoadmapItem(root, key);
      if (!f) {
        console.error(`${key} is not in any roadmap`);
        return 1;
      }
      const { roadmap: r, item } = f;
      const epic = r.items.find((i) => i.id === item.epic);
      console.log(
        JSON.stringify(
          { roadmap: r.slug, path: r.path, document: r.data.source || undefined, id: item.id, title: item.title, epic: epic ? `${epic.id} · ${epic.title}` : undefined, ...item.fields, description: item.description, criteria: item.criteria, depends: item.depends },
          null,
          2,
        ),
      );
      return 0;
    }
    case 'list': {
      const all = listRoadmaps(root);
      if (!all.length) console.log('No roadmaps yet: sdlc roadmap new <slug> --source <file|url>.');
      for (const r of all) {
        const c = checkRoadmap(r);
        const keys = r.items.filter((i) => i.fields.key).length;
        console.log(`${r.slug.padEnd(20)} ${(r.data.status || 'draft').padEnd(9)} ${count(c.epics, 'epic')}, ${count(c.stories, 'story', 'stories')}, ${keys}/${r.items.length} tickets  ${r.title}`);
      }
      return 0;
    }
    default:
      console.error(ROADMAP_HELP);
      return 1;
  }
}

/** A roadmap whose stories are the discovery features ready to build; the blocked ones become its open questions. */
async function fromDiscovery(root: string, loaded: LoadedConfig | undefined, slug: string, topics: string[], title?: string): Promise<number> {
  const d = loadDiscovery(root, loaded);
  const problems = validateDiscovery(root, loaded, d).errors;
  if (problems.length) fail(`discovery has ${count(problems.length, 'problem')}: fix them first (sdlc discovery validate)`);
  const t = title ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const plan = discoveryRoadmap(d, { slug, title: t, topics, locale: localeOf(loaded) });
  if (!plan.stories.length) fail(`no features ready to build in ${topics.join(', ') || d.dir} (requested or reimplement, no ticket, not blocked)${plan.blocked.length ? `; blocked: ${plan.blocked.join(', ')}` : ''}`);
  const r = await newRoadmap(root, slug, { title: t, loaded });
  const file = join(root, r.path);
  const head = readFileSync(file, 'utf8').split(/^# Roadmap: .*$/m)[0];
  writeFileSync(file, setFrontmatter(head, { source: `${d.dir}/STATUS.md` }) + plan.body);
  console.log(`created ${r.path}: ${count(plan.epics, 'epic')}, ${count(plan.stories.length, 'story', 'stories')} from ${d.dir}${plan.blocked.length ? `; ${count(plan.blocked.length, 'open question')} for the blocked ${plan.blocked.join(', ')}` : ''}`);
  console.log(`Next: /sdlc-roadmap ${slug} in your agent completes the acceptance criteria, risk and dependencies.`);
  return 0;
}

const str = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined);

function fail(msg: string): never {
  throw new SdlcError(msg);
}
