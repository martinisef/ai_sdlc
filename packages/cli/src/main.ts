#!/usr/bin/env node
// sdlc — CLI of the AI-native loop. Same core for every agent, the dashboard and CI.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentDir, doctor, prePush, preCommit, runHook, sync, type HookAgent, type SyncReport } from '@ai-native-sdlc/adapters';
import {
  ARTIFACTS,
  CONFIG_PATH,
  LEGACY_CONFIG_PATH,
  configJsonSchema,
  branchFiles,
  changeRisk,
  explainersFor,
  listExplainers,
  checkQuick,
  decideGate,
  ensureSdlcDir,
  formatNext,
  funnel,
  FUNNEL_STEPS,
  maybeSendTelemetry,
  readTelemetry,
  telemetryPath,
  telemetryPayload,
  telemetryState,
  writeTelemetry,
  type Funnel,
  type TelemetryState,
  nextAction,
  FIX_LOCKS,
  gitOrThrow,
  gitUser,
  isQuick,
  listChanges,
  loadConfig,
  localeOf,
  metrics,
  METRIC_VALUES,
  PR_STATS_PATH,
  durationSeconds,
  projectDir,
  promote,
  quickLimits,
  recordEvent,
  SdlcError,
  setFrontmatter,
  t,
  writeConfig,
  type Artifact,
} from '@ai-native-sdlc/core';
import { refreshPrStats } from './metrics.ts';
import { askConfig, detectConfig, ignoreNodeModules, presetConfig, scaffold, templateFor } from './init.ts';
import { defaultPreset, isPreset, PRESET_SPECS, PRESETS, type Preset } from './presets.ts';
import { ciSecrets, installCi } from './ci/install.ts';
import { fixDoctor, migrateLegacy } from './doctor-fix.ts';
import { trackerCommand, vcsCommand } from './integrations.ts';
import { ROADMAP_HELP, roadmapCommand } from './roadmap.ts';
import { bandsCommand } from './bands.ts';
import { ciCommand } from './ci/index.ts';
import { notifyCommand } from './notify.ts';

declare const __SDLC_VERSION__: string | undefined;
/** Injected by scripts/build-cli.mjs; from source, read package.json. */
const VERSION =
  typeof __SDLC_VERSION__ === 'string'
    ? __SDLC_VERSION__
    : (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

const HELP = `sdlc ${VERSION} — AI-native SDLC loop (intent → spec → plan → build → ship → incident)

Setup
  init [--preset solo|team-github|regulated] [--yes] [--no-ci] [--first-change "title"] [--locale en|es] [--verbose]
                                     detect stack/VCS/agents, apply the preset, scaffold, sync, install CI
  sync [--force] [--dry-run]         regenerate agent files (Claude, Cursor, AGENTS.md) and git hooks
  doctor [--fix] [--json]            health checks + enforcement matrix per agent; --fix repairs what it can
  migrate                            .claude/sdlc.json → .sdlc/config.json
  schema                             JSON Schema of .sdlc/config.json

Loop
  next [--json]                      the one thing to do now: approve, ask the agent, ship, or start a change
  status [--json]                    changes and their stage
  metrics [--json] [--funnel]        leading indicators from git + activity log; --funnel: how far changes get
          [--since 30d] [--prs]      window for the guardrails; --prs: refresh review rounds and comments from the forge
          [--value <name>]           one number for a control band (revert_rate, incident_rate, waiting_hours_p95, …)
  telemetry on|off|status [--payload]   opt-in anonymous counts (off by default; needs SDLC_TELEMETRY_URL)
  new <slug> [--ticket KEY] [--title T] [--no-branch]
  quick "<what>" [--ticket KEY] [--no-branch]   small change without spec/plan (limits checked on push)
  quick --check [--json]             is the active quick change still within quick_lane limits?
  promote [<change>]                 quick lane → full loop (intent back to draft for the PO)
  risk [<change>] [--base B] [--json]   risk tier set by the change: diff against the base, paths the spec/plan name, declared risk
  explainers [<path>…] [--json]      module explainers (docs/explainers, written by /sdlc-explain); with paths: the ones covering them
  approve <change> <intent|spec|plan> [-m comment] [--auto]
                                     --auto: record the approval when the risk tier needs no person (risk.profile graded)
  reject  <change> <intent|spec|plan> [-m comment]
  roadmap <new|check|approve|reject|apply|status|find|list> …
                                     a technical plan → epics and stories → tickets (sdlc roadmap --help)
  lock on|off|status                 test-lock during a fix
  ui [--port N] [--no-open]          local dashboard

Integrations
  hook <event> --agent claude|cursor|git   guardrail entry point (called by generated hooks)
  vcs <args…>                        PR/MR helper (github, gitlab, bitbucket)
  tracker <args…>                    Jira helper
  ci <cmd>                           CI entry point: bootstrap, review, intent-to-spec, triage, tracker-merged, gate, evals
  bands check [--json] [--dry-run]   Stage 6: evaluate ops/bands.yaml; log / diagnose / open an incident intent
  notify <event> [--change ID] [--dry-run]   gate.pending|gate.decided|spec.ready|review.done|change.merged → Slack or a webhook
  webhook [--port N]                 experimental: @claude in GitLab/Bitbucket comments → triggers \`sdlc ci mention\` in CI
  hosted [--port N]                  experimental: read-only org board over a GitHub App installation (docs/rfc/hosted.md)

Stable within 1.x unless marked experimental: https://martinisef.github.io/ai_sdlc/reference/stability
`;

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-m') flags.m = argv[++i] ?? '';
    else if (a === '-h') flags.h = true;
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) flags[k] = v;
      else if (['agent', 'port', 'ticket', 'title', 'locale', 'preset', 'first-change', 'change', 'artifact', 'decision', 'by', 'pr-url', 'base', 'value', 'since', 'source'].includes(k)) flags[k] = argv[++i] ?? '';
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function fail(msg: string): never {
  process.stderr.write(`sdlc: ${msg}\n`);
  process.exit(1);
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function requireConfig(root: string) {
  const loaded = loadConfig(root);
  if (!loaded) fail(`no ${CONFIG_PATH} in ${root} — run \`sdlc init\``);
  return loaded;
}

function printSync(r: SyncReport) {
  for (const p of r.written) console.log(`  wrote     ${p}`);
  for (const p of r.removed) console.log(`  removed   ${p} (no longer generated)`);
  for (const p of r.drift) console.log(`  drift     ${p} (edited by hand; kept — --force to regenerate)`);
  for (const p of r.conflicts) console.log(`  conflict  ${p} (existed before sdlc; kept — --force to replace)`);
  console.log(`  ${r.unchanged.length} unchanged`);
  if (r.hooksPath) console.log(r.hooksPath.set ? '  git hooks: core.hooksPath=.sdlc/git-hooks' : `  git hooks: not installed (${r.hooksPath.note})`);
}

function slugify(title: string): string {
  return title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '') || 'change';
}

function newChange(root: string, slug: string, opts: { ticket?: string; title?: string; branch: boolean; quick?: boolean }) {
  const loaded = loadConfig(root);
  const dir = `changes/${new Date().toISOString().slice(0, 7)}-${slug}`;
  if (existsSync(join(root, dir))) fail(`${dir} already exists`);
  if (opts.branch) gitOrThrow(root, ['checkout', '-b', `change/${slug}`]);
  const who = gitUser(root);
  const fields: Record<string, string> = { change: slug, created: new Date().toISOString().slice(0, 10), author: who.name ?? who.email ?? '' };
  if (opts.ticket) fields.ticket = opts.ticket;
  let body: string;
  if (opts.quick) {
    body = setFrontmatter(`---\n---\n# Quick: ${opts.title}\n\n${opts.title}\n`, { ...fields, lane: 'quick', status: 'accepted' });
  } else {
    body = setFrontmatter(templateFor(root, 'intent', localeOf(loaded)), fields);
    if (opts.title) body = body.replace(/^# (Intent: )?.*$/m, (_m, p: string | undefined) => `# ${p ?? ''}${opts.title}`);
  }
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, 'intent.md'), body);
  recordEvent(root, { type: opts.quick ? 'change.quick' : 'change.new', change: slug, by: who.name });
  console.log(`created ${dir}/intent.md${opts.branch ? ` on branch change/${slug}` : ''}${opts.quick ? ' (quick lane: no spec, no plan)' : ''}`);
  if (!loaded) console.log('Note: project not configured (sdlc init).');
  else if (opts.quick) console.log(`Next: /sdlc-quick in your agent. Limits on push: ${quickLimits(loaded).maxFiles} code files, no high-risk paths (sdlc quick --check).`);
  else console.log('Next: fill it with your agent (/sdlc-intent) and ask the PO to accept it (sdlc approve).');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  const root = projectDir();

  // ci, vcs, tracker and bands print their own help
  if ((flags.help || flags.h) && cmd === 'roadmap') return void console.log(ROADMAP_HELP);
  if ((flags.help || flags.h) && cmd && !['ci', 'vcs', 'tracker', 'bands'].includes(cmd)) {
    const usage = HELP.split('\n').filter((l) => l.trimStart().startsWith(`${cmd} `));
    process.stdout.write(usage.length ? usage.map((l) => `sdlc ${l.trim()}`).join('\n') + '\n' : HELP);
    return;
  }

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP);
      return;
    case '--version':
    case 'version':
      console.log(VERSION);
      return;

    case 'hook': {
      const agent = String(flags.agent ?? 'claude');
      const event = pos[0];
      let out;
      if (agent === 'git') {
        out = event === 'pre-push' ? prePush(root) : preCommit(root);
      } else if (agent === 'claude' || agent === 'cursor') {
        out = runHook(agent as HookAgent, event, readStdin());
      } else fail(`unknown agent: ${agent}`);
      if (out.stdout) process.stdout.write(out.stdout + '\n');
      if (out.stderr) process.stderr.write(out.stderr + '\n');
      process.exit(out.exitCode);
    }

    case 'init': {
      if (loadConfig(root) && !flags.force) fail(`already configured (${loadConfig(root)!.path}); edit it or use \`sdlc ui\`, then \`sdlc sync\``);
      const locale = flags.locale === 'es' ? 'es' : 'en';
      if (flags.preset !== undefined && !isPreset(flags.preset)) fail(`unknown preset ${flags.preset} (${PRESETS.join('|')})`);
      const detected = detectConfig(root, locale);
      let preset: Preset = isPreset(flags.preset) ? flags.preset : defaultPreset(detected);
      let config = presetConfig(detected, preset);
      if (!flags.yes && process.stdin.isTTY) ({ preset, config } = await askConfig(detected, isPreset(flags.preset) ? flags.preset : undefined));
      writeConfig(root, config);
      recordEvent(root, { type: 'setup.init', detail: preset });
      const created = scaffold(root, { claudeMd: (config.agents ?? []).includes('claude'), locale });
      const ignored = ignoreNodeModules(root);
      const report = sync(root, requireConfig(root));
      const provider = config.vcs?.provider;
      const ci = flags['no-ci'] || !provider ? undefined : installCi(root, config, { provider, locale, files: PRESET_SPECS[preset].github });
      if (flags.verbose) {
        for (const p of created) console.log(`  scaffold  ${p}`);
        printSync(report);
      }
      const roles = Object.entries(config.roles ?? {}).map(([r, who]) => `${r}: ${who.join(', ')}`);
      console.log(`✓ ai-sdlc ready · preset ${preset} · ${config.stack?.language ?? 'unknown stack'} · agents: ${(config.agents ?? []).join(', ')}`);
      console.log(`  config   ${CONFIG_PATH} (${created.length} scaffold files, ${report.written.length} agent files; --verbose lists them)`);
      console.log(`  gates    ${Object.keys(config.gates ?? {}).length ? (roles.length ? roles.join(' · ') : 'by role, nobody assigned yet: any person') : 'any person (never an agent)'}`);
      if (ignored) console.log('  git      added node_modules/ to .gitignore');
      console.log(
        `  CI       ${ci ? `${ci.written.length} file(s) for ${provider}${ci.conflicts.length ? `, ${ci.conflicts.length} kept` : ''}; secret ${ciSecrets(config).join(', ')}` : provider ? 'skipped (--no-ci)' : 'no remote detected: `sdlc ci install --provider github|gitlab|bitbucket` later'}`,
      );
      if (typeof flags['first-change'] === 'string') {
        const title = flags['first-change'];
        const slug = slugify(title);
        newChange(root, slug, { title, branch: true });
      } else console.log('Next: sdlc next (it always tells you what to do), or sdlc new <slug> to start a change.');
      return;
    }

    case 'sync': {
      const loaded = requireConfig(root);
      printSync(sync(root, loaded, { force: !!flags.force, dryRun: !!flags['dry-run'] }));
      return;
    }

    case 'doctor': {
      if (flags.fix) {
        const fixes = fixDoctor(root);
        if (fixes.some((f) => f.fixed)) recordEvent(root, { type: 'setup.fix', detail: fixes.filter((f) => f.fixed).map((f) => f.id).join(',') });
        if (flags.json) return void console.log(JSON.stringify(fixes, null, 2));
        if (!fixes.length) console.log('nothing to fix');
        for (const f of fixes) console.log(`${f.fixed ? 'fixed ' : 'manual'}  ${f.id.padEnd(14)} ${f.message}`);
        console.log('');
      }
      const r = doctor(root);
      if (flags.json) return void console.log(JSON.stringify(r, null, 2));
      for (const c of r.checks) console.log(`${c.ok ? '✓' : c.level === 'warn' ? '!' : '✗'} ${c.message}`);
      if (r.agents.length) {
        console.log('\nEnforcement (blocks = stopped before it happens · commit/push = git hooks · post-hoc = after, reported · advisory = instructions only)');
        const pad = (s: string, n: number) => s.padEnd(n);
        console.log(pad('guardrail', 18) + r.agents.map((a) => pad(a, 22)).join(''));
        for (const row of r.matrix) console.log(pad(row.guardrail, 18) + r.agents.map((a) => pad(row[a].join(' + '), 22)).join(''));
      }
      process.exitCode = r.checks.some((c) => !c.ok && c.level === 'error') ? 1 : 0;
      return;
    }

    case 'migrate': {
      const legacy = join(root, LEGACY_CONFIG_PATH);
      if (!existsSync(legacy)) fail(`no ${LEGACY_CONFIG_PATH} to migrate`);
      if (existsSync(join(root, CONFIG_PATH))) fail(`${CONFIG_PATH} already exists`);
      migrateLegacy(root);
      console.log(`moved ${LEGACY_CONFIG_PATH} → ${CONFIG_PATH}`);
      printSync(sync(root, requireConfig(root)));
      return;
    }

    case 'schema':
      console.log(JSON.stringify(configJsonSchema(), null, 2));
      return;

    case 'status': {
      if (flags.metrics) {
        process.stderr.write('sdlc: `status --metrics` is deprecated and goes in 2.0; use `sdlc metrics`\n');
        return printMetricsLegacy(root);
      }
      const loaded = loadConfig(root);
      const locale = localeOf(loaded);
      const changes = listChanges(root, { locale, defaultBranch: loaded?.config.vcs?.default_branch });
      if (!changes.length) return void (flags.json || console.log(t(locale, 'status.empty')));
      for (const c of changes) {
        if (flags.json)
          console.log(JSON.stringify({ change: c.id, slug: c.slug, title: c.title ?? '', stage: c.stage, ticket: c.ticket ?? '', statuses: c.statuses, active: c.active, next: c.next }));
        else console.log(`${c.active ? '*' : ''}${c.id}\t${c.stage}\t${c.ticket ?? '-'}\t${c.statuses}`);
      }
      return;
    }

    case 'telemetry': {
      const sub = pos[0] ?? 'status';
      if (sub === 'on' || sub === 'off') writeTelemetry({ ...readTelemetry(), enabled: sub === 'on' });
      else if (sub !== 'status') fail('usage: sdlc telemetry on|off|status');
      const state = telemetryState();
      const why: Record<TelemetryState, string> = {
        on: `on: one anonymous summary a day to ${process.env.SDLC_TELEMETRY_URL}`,
        off: 'off (default). `sdlc telemetry on` to share anonymous counts; nothing leaves this machine until then',
        'blocked-dnt': 'off: DO_NOT_TRACK is set',
        'no-endpoint': 'enabled, but nothing is sent: SDLC_TELEMETRY_URL is not set',
      };
      console.log(`telemetry ${why[state]}`);
      console.log(`settings: ${telemetryPath()} · what is sent: sdlc telemetry status --payload · docs/reference/telemetry.md`);
      if (flags.payload) console.log(JSON.stringify(telemetryPayload(root, loadConfig(root), VERSION), null, 2));
      return;
    }

    case 'next': {
      const n = nextAction(root, loadConfig(root));
      if (flags.json) return void console.log(JSON.stringify(n, null, 2));
      console.log(formatNext(n));
      for (const g of n.inbox) console.log(`  also yours: sdlc approve ${g.change} ${g.artifact}`);
      return;
    }

    case 'metrics': {
      const loaded = loadConfig(root);
      if (flags.funnel) {
        const f = funnel(root, loaded);
        if (flags.json) return void console.log(JSON.stringify(f, null, 2));
        return printFunnel(f);
      }
      if (flags.prs) {
        const r = await refreshPrStats(root, loaded);
        for (const f of r.failed) console.error(`could not read ${f}`);
        console.error(`${PR_STATS_PATH}: ${Object.keys(r.changes).length} PR(s)`);
      }
      let since: Date | undefined;
      if (typeof flags.since === 'string') {
        try {
          since = new Date(Date.now() - durationSeconds(flags.since) * 1000);
        } catch (e) {
          fail((e as Error).message);
        }
      }
      const m = metrics(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch, since });
      if (flags.value !== undefined) {
        const get = METRIC_VALUES[String(flags.value)];
        if (!get) fail(`unknown metric ${flags.value} (${Object.keys(METRIC_VALUES).join(', ')})`);
        const v = get(m.summary);
        if (v === undefined) fail(`${flags.value}: no data yet`);
        return void console.log(String(v));
      }
      if (flags.json) return void console.log(JSON.stringify(m, null, 2));
      return printMetricsLegacy(root, m);
    }

    case 'new': {
      const slug = pos[0];
      if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) fail('usage: sdlc new <slug> (letters, digits, dashes)');
      newChange(root, slug, {
        ticket: typeof flags.ticket === 'string' ? flags.ticket : undefined,
        title: typeof flags.title === 'string' ? flags.title : undefined,
        branch: !flags['no-branch'],
      });
      return;
    }

    case 'quick': {
      const loaded = requireConfig(root);
      if (flags.check) {
        const change = listChanges(root, { locale: localeOf(loaded), defaultBranch: loaded.config.vcs?.default_branch }).find((c) => c.active);
        if (!change || !isQuick(change)) fail('the active change is not in the quick lane (sdlc quick "<title>" starts one)');
        const q = checkQuick(loaded, branchFiles(root, loaded.config.vcs?.default_branch ?? 'main'));
        if (flags.json) console.log(JSON.stringify({ change: change.slug, ...q }));
        else console.log(q.ok ? `ok: ${q.files.length}/${quickLimits(loaded).maxFiles} code files, no high-risk paths` : `promote it (sdlc promote ${change.slug}): ${q.reason}`);
        process.exitCode = q.ok ? 0 : 1;
        return;
      }
      if (!quickLimits(loaded).enabled) fail(t(localeOf(loaded), 'quick.disabled'));
      const title = pos.join(' ').trim();
      if (!title) fail('usage: sdlc quick "<what to change>" [--ticket KEY] [--no-branch] · sdlc quick --check');
      const slug = slugify(title);
      newChange(root, slug, { title, ticket: typeof flags.ticket === 'string' ? flags.ticket : undefined, branch: !flags['no-branch'], quick: true });
      return;
    }

    case 'promote': {
      const loaded = requireConfig(root);
      const id = pos[0] ?? listChanges(root, { locale: localeOf(loaded) }).find((c) => c.active)?.slug;
      if (!id) fail('usage: sdlc promote [<change>] (defaults to the active change)');
      try {
        const c = promote(root, loaded, id, gitUser(root).name);
        console.log(`${c.id} is now in the full loop: intent.md is a draft. Next: /sdlc-intent to complete it, then the PO accepts it (sdlc approve ${c.slug} intent).`);
      } catch (e) {
        if (e instanceof SdlcError) fail(e.message);
        throw e;
      }
      return;
    }

    case 'approve':
    case 'reject': {
      const [change, artifact] = pos;
      if (!change || !ARTIFACTS.includes(artifact as Artifact)) fail(`usage: sdlc ${cmd} <change> <${ARTIFACTS.join('|')}> [-m comment]${cmd === 'approve' ? ' [--auto]' : ''}`);
      try {
        if (flags.auto && cmd !== 'approve') fail('--auto only applies to sdlc approve');
        const r = decideGate(root, loadConfig(root), change, artifact as Artifact, cmd === 'approve' ? 'approved' : 'rejected', {
          comment: typeof flags.m === 'string' ? flags.m : undefined,
          auto: !!flags.auto,
        });
        const partial = r.approvals && r.approvals.have < r.approvals.need ? `; ${r.approvals.have} of ${r.approvals.need} approvals, still waiting for another person` : '';
        console.log(`${r.change}/${r.artifact}.md ${r.decision} by ${r.by} (${r.commit})${partial}`);
      } catch (e) {
        fail((e as Error).message);
      }
      return;
    }

    case 'risk': {
      const loaded = loadConfig(root);
      const changes = listChanges(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch });
      const id = pos[0];
      const change = id ? changes.find((c) => c.dir === id.replace(/^changes\//, '') || c.slug === id) : changes.find((c) => c.active);
      if (id && !change) fail(`change not found: ${id}`);
      const base = typeof flags.base === 'string' ? flags.base : (loaded?.config.vcs?.default_branch ?? 'main');
      const r = changeRisk(root, loaded, change, { base });
      if (flags.json) return void console.log(JSON.stringify({ change: change?.id, ...r }, null, 2));
      console.log(`${change ? `${change.id}: ` : ''}${r.tier} risk (${r.files} files against ${base}, ${r.weight} weighted lines of code)`);
      for (const x of r.reasons) console.log(`  ${x.tier.padEnd(6)} ${x.reason}`);
      return;
    }

    case 'explainers': {
      const list = pos.length ? explainersFor(root, pos) : listExplainers(root);
      if (flags.json) return void console.log(JSON.stringify(list, null, 2));
      if (!list.length) return void console.log(pos.length ? 'No explainer covers these paths (/sdlc-explain <module> writes one).' : 'No explainers yet (/sdlc-explain <module> writes one).');
      for (const e of list) console.log(`${e.path}  ${e.module}${e.stale ? '  (stale: the module changed after it was written; /sdlc-explain to refresh)' : ''}`);
      return;
    }

    case 'notify':
      process.exitCode = await notifyCommand(root, loadConfig(root), pos, flags);
      return;

    case 'lock': {
      const lock = join(root, FIX_LOCKS[0]);
      if (pos[0] === 'on') {
        ensureSdlcDir(root);
        writeFileSync(lock, new Date().toISOString() + '\n');
        console.log('test-lock ON: test files cannot be edited until `sdlc lock off`');
      } else if (pos[0] === 'off') {
        for (const p of FIX_LOCKS) rmSync(join(root, p), { force: true });
        console.log('test-lock OFF');
      } else {
        console.log(FIX_LOCKS.some((p) => existsSync(join(root, p))) ? 'on' : 'off');
      }
      return;
    }

    case 'ui': {
      const { startServer } = await import('@ai-native-sdlc/server');
      await startServer({ root, port: flags.port ? Number(flags.port) : undefined, open: !flags['no-open'] });
      return;
    }

    case 'webhook': {
      const { startWebhook } = await import('@ai-native-sdlc/webhook');
      await startWebhook({ port: flags.port ? Number(flags.port) : undefined }).catch((e: Error) => fail(e.message));
      return;
    }

    case 'hosted': {
      const { startHosted } = await import('@ai-native-sdlc/hosted');
      await startHosted({ port: flags.port ? Number(flags.port) : undefined }).catch((e: Error) => fail(e.message));
      return;
    }

    case 'vcs':
      process.exitCode = await vcsCommand(root, rest);
      return;
    case 'tracker':
      process.exitCode = await trackerCommand(root, rest);
      return;
    case 'roadmap':
      process.exitCode = await roadmapCommand(root, pos, flags);
      return;
    case 'ci':
      process.exitCode = await ciCommand(root, rest);
      return;
    case 'bands':
      process.exitCode = await bandsCommand(root, rest);
      return;

    default:
      fail(`unknown command: ${cmd}\n\n${HELP}`);
  }
}

function printFunnel(f: Funnel) {
  const top = f.loop.started || 1;
  console.log(`Full loop (${f.loop.started} change${f.loop.started === 1 ? '' : 's'}${f.rejected ? `, ${f.rejected} rejected` : ''})`);
  for (const s of FUNNEL_STEPS) console.log(`  ${s.padEnd(16)} ${String(f.loop[s]).padStart(4)}  ${'█'.repeat(Math.round((f.loop[s] / top) * 20)).padEnd(20)} ${Math.round((f.loop[s] / top) * 100)}%`);
  console.log(`Quick lane: ${f.quick.started} started, ${f.quick.merged} merged, ${f.quick.promoted} promoted to the full loop`);
  const m = (x?: number) => (x === undefined ? '-' : x < 120 ? `${x} min` : `${(x / 60).toFixed(1)} h`);
  console.log(`From sdlc init (this machine): first change ${m(f.firsts.change)} · first quick change ${m(f.firsts.quick)} · first gate decision ${m(f.firsts.gate)}`);
}

function printMetricsLegacy(root: string, m = metrics(root)) {
  const h = (x?: number) => (x === undefined ? '-' : x.toFixed(1));
  for (const c of m.changes) {
    console.log(`${c.change}\tintent→spec: ${h(c.intentToSpecH)}h\tspec→plan: ${h(c.specToPlanH)}h\tspec rework post-plan: ${c.specReworkAfterPlan ?? '-'}`);
  }
  const s = m.summary;
  const sp = (x: { median?: number; p95?: number }, unit = '') => (x.median === undefined ? '-' : `median ${h(x.median)}${unit}, p95 ${h(x.p95)}${unit}`);
  const pct = (x?: number) => (x === undefined ? '-' : `${Math.round(x * 1000) / 10}%`);
  console.log(`${m.changes.length ? '\n' : ''}Human time: approvals per change ${sp(s.humanApprovals)} · waiting for a person ${sp(s.waitingH, 'h')}`);
  console.log(`Review: rounds ${sp(s.reviewRounds)} · human comments ${sp(s.humanComments)}${s.reviewRounds.median === undefined ? ' (sdlc metrics --prs)' : ''}`);
  console.log(`Guardrails: reverts ${s.reverts}/${s.landed} (${pct(s.revertRate)}) · incidents ${s.incidents} (${pct(s.incidentRate)} per change)`);
  if (s.riskFloor) console.log(`Circuit breaker: minimum tier ${s.riskFloor.tier} until ${s.riskFloor.until} (${s.riskFloor.reason})`);
}

const TELEMETRY_CMDS = new Set(['init', 'next', 'status', 'metrics', 'new', 'quick', 'promote', 'approve', 'reject', 'doctor', 'sync']);

main()
  .then(() => (TELEMETRY_CMDS.has(process.argv[2] ?? '') ? maybeSendTelemetry(projectDir(), loadConfig(projectDir()), VERSION) : undefined))
  .catch((e) => {
    if (e instanceof SdlcError) {
      process.stderr.write(`sdlc: ${e.message}\n`);
      process.exit(e.exitCode);
    }
    fail((e as Error).stack ?? String(e));
  });
