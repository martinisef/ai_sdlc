// `sdlc discovery …` (experimental): project state from meeting transcripts, in changes/_discovery/.
// The agent (/sdlc-discovery) extracts and merges; these commands register sources, check the topics, write STATUS.md
// and gather what the agent cross-checks against (tracker, unmerged branches, earlier topics). None writes to the tracker.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  addSource,
  discoveryBase,
  followupDraft,
  loadConfig,
  loadDiscovery,
  localeOf,
  recordEvent,
  searchDiscovery,
  seedDiscovery,
  SdlcError,
  tracker,
  unmergedBranches,
  validateDiscovery,
  writeStatus,
  type DiscoveryLocale,
} from '@ai-native-sdlc/core';

export const DISCOVERY_HELP = `sdlc discovery add <file> --name N [--date YYYY-MM-DD] [--type client|review|daily|internal|other] [--check] [--force]
                                                 register a transcript (pdf, md, txt, vtt, srt): refuses one already processed or older than the last
sdlc discovery validate [--json]                 format, closed statuses, evidence, append-only history (exit 1 on errors)
sdlc discovery status [--json]                   rewrite STATUS.md from the topics
sdlc discovery seed [--dry-run] [--limit N] [--json]
                                                 baseline (topics/_baseline.md) from tracker issues, changes/, roadmap stories and unmerged branches
sdlc discovery branches [--json]                 unmerged branches against the base: last commit, files, tickets
sdlc discovery search <words…> [--json]          rows of every topic that mention the words
sdlc discovery followup [--write] [--json]       draft of the client follow-up: open questions and their action items`;

type Flags = Record<string, string | true>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function discoveryCommand(root: string, pos: string[], flags: Flags): Promise<number> {
  const [sub, ...args] = pos;
  const loaded = loadConfig(root);
  const json = !!flags.json;
  switch (sub) {
    case 'add': {
      const file = args[0] ?? fail('usage: sdlc discovery add <file> --name "Weekly review" [--date YYYY-MM-DD]');
      const name = str(flags.name) ?? fail('--name is required: how evidence cites this meeting ("Weekly review")');
      const r = addSource(root, loaded, resolve(process.cwd(), file), { name, date: str(flags.date), type: str(flags.type), check: !!flags.check, force: !!flags.force });
      if (json) console.log(JSON.stringify(r, null, 2));
      else if (r.duplicate) console.log(`✗ already processed as '${r.duplicate}': nothing to do`);
      else if (r.olderThan && !r.written && !flags.check) console.log(`✗ ${r.date} is older than the last source ('${r.olderThan}'): --force adds it anyway`);
      else if (!r.written) console.log(`✓ ${r.label} is new${r.olderThan ? ` (older than '${r.olderThan}': add it with --force)` : ''}`);
      else {
        recordEvent(root, { type: 'discovery.source', change: loadDiscovery(root, loaded).dir, detail: r.label });
        console.log(`added '${r.label}' → ${r.file}`);
        console.log(`Next: /sdlc-discovery in your agent merges it into the topics (evidence cites "${r.label}").`);
      }
      return r.duplicate || (r.olderThan && !flags.force) ? 1 : 0;
    }
    case 'validate': {
      const c = validateDiscovery(root, loaded);
      if (json) console.log(JSON.stringify(c, null, 2));
      else {
        for (const e of c.errors) console.log(`✗ ${e}`);
        for (const w of c.warnings) console.log(`! ${w}`);
        console.log(`${c.errors.length ? '✗' : '✓'} ${c.topics} topics, ${c.rows} rows, ${c.sources} sources${c.errors.length ? `, ${c.errors.length} problems` : ''}`);
      }
      return c.errors.length ? 1 : 0;
    }
    case 'status': {
      const d = loadDiscovery(root, loaded);
      if (!d.topics.length && !d.sources.length) fail(`no discovery in ${d.dir} yet: sdlc discovery add <transcript> or sdlc discovery seed`);
      const { path, status } = writeStatus(root, loaded);
      if (json) console.log(JSON.stringify(status, null, 2));
      else console.log(`wrote ${path}: ${status.todo.length} to do, ${plural(status.questions.length, 'open question')}, ${plural(status.actions.length, 'open action item')}`);
      return 0;
    }
    case 'seed': {
      const limit = str(flags.limit);
      const r = await seedDiscovery(root, loaded, { dryRun: !!flags['dry-run'], limit: limit ? Number(limit) : undefined, tracker: () => tracker(loaded, process.env, root) });
      if (json) console.log(JSON.stringify(r, null, 2));
      else {
        for (const w of r.warnings) console.log(`! ${w}`);
        const { tracker: t, changes, stories, branches } = r.counts;
        console.log(`${r.dryRun ? 'would write' : 'wrote'} ${r.path}: ${r.added.length} added, ${r.updated.length} updated, ${r.unchanged} unchanged (from ${plural(t, 'ticket')}, ${plural(changes, 'change')}, ${plural(stories, 'roadmap story', 'roadmap stories')}, ${plural(branches, 'branch', 'branches')})`);
        if (!r.dryRun && (r.added.length || r.updated.length)) console.log('Next: sdlc discovery status, then commit the discovery folder.');
      }
      return 0;
    }
    case 'branches': {
      const base = discoveryBase(root, loaded);
      const branches = unmergedBranches(root, loaded);
      if (json) console.log(JSON.stringify({ base, branches }, null, 2));
      else {
        if (!branches.length) console.log(`no branches with work missing from ${base}`);
        for (const b of branches) {
          const extra = [b.change ? `change ${b.change}` : '', ...b.tickets].filter(Boolean).join(', ');
          console.log(`${b.name}\t${b.date}\t${b.author}\t+${b.ahead}\t${plural(b.filesTotal, 'file')}${extra ? `\t${extra}` : ''}\t${b.subject}`);
        }
      }
      return 0;
    }
    case 'search': {
      if (!args.length) fail('usage: sdlc discovery search <words…>');
      const hits = searchDiscovery(loadDiscovery(root, loaded), args.join(' '), Number(str(flags.limit) ?? 20));
      if (json) console.log(JSON.stringify(hits, null, 2));
      else for (const h of hits) console.log(`${h.ref}\t${h.status}\t${h.text}`);
      return 0;
    }
    case 'followup': {
      const d = loadDiscovery(root, loaded);
      const locale: DiscoveryLocale = loaded?.config.discovery?.followup_locale ?? localeOf(loaded);
      const f = followupDraft(d, locale);
      if (flags.write) {
        mkdirSync(dirname(join(root, f.path)), { recursive: true });
        writeFileSync(join(root, f.path), f.body);
      }
      if (json) console.log(JSON.stringify({ ...f, written: !!flags.write }, null, 2));
      else if (flags.write) console.log(`wrote ${f.path}`);
      else process.stdout.write(f.body);
      return 0;
    }
    default:
      console.error(DISCOVERY_HELP);
      return 1;
  }
}

const str = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined);

function fail(msg: string): never {
  throw new SdlcError(msg);
}
