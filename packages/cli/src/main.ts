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
  decideGate,
  ensureSdlcDir,
  formatNext,
  nextAction,
  FIX_LOCKS,
  gitOrThrow,
  gitUser,
  listChanges,
  loadConfig,
  localeOf,
  metrics,
  projectDir,
  SdlcError,
  setFrontmatter,
  t,
  writeConfig,
  type Artifact,
} from '@ai-native-sdlc/core';
import { askConfig, detectConfig, presetConfig, scaffold, templateFor } from './init.ts';
import { defaultPreset, isPreset, PRESET_SPECS, PRESETS, type Preset } from './presets.ts';
import { ciSecrets, installCi } from './ci/install.ts';
import { trackerCommand, vcsCommand } from './integrations.ts';
import { bandsCommand } from './bands.ts';
import { ciCommand } from './ci/index.ts';

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
  doctor [--json]                    health checks + enforcement matrix per agent
  migrate                            .claude/sdlc.json → .sdlc/config.json
  schema                             JSON Schema of .sdlc/config.json

Loop
  next [--json]                      the one thing to do now: approve, ask the agent, ship, or start a change
  status [--json | --metrics]        changes and their stage
  metrics [--json]                   leading indicators from git + activity log
  new <slug> [--ticket KEY] [--title T] [--no-branch]
  approve <change> <intent|spec|plan> [-m comment]
  reject  <change> <intent|spec|plan> [-m comment]
  lock on|off|status                 test-lock during a fix
  ui [--port N] [--no-open]          local dashboard

Integrations
  hook <event> --agent claude|cursor|git   guardrail entry point (called by generated hooks)
  vcs <args…>                        PR/MR helper (github, gitlab, bitbucket)
  tracker <args…>                    Jira helper
  ci <cmd>                           CI entry point: bootstrap, review, intent-to-spec, triage, jira-merged, evals
  bands check [--json] [--dry-run]   Stage 6: evaluate ops/bands.yaml; log / diagnose / open an incident intent
  webhook [--port N]                 @claude in GitLab/Bitbucket comments → triggers \`sdlc ci mention\` in CI
  hosted [--port N]                  read-only org board over a GitHub App installation (docs/rfc/hosted.md)
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
      else if (['agent', 'port', 'ticket', 'title', 'locale', 'preset', 'first-change'].includes(k)) flags[k] = argv[++i] ?? '';
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

function newChange(root: string, slug: string, opts: { ticket?: string; title?: string; branch: boolean }) {
  const loaded = loadConfig(root);
  const dir = `changes/${new Date().toISOString().slice(0, 7)}-${slug}`;
  if (existsSync(join(root, dir))) fail(`${dir} already exists`);
  if (opts.branch) gitOrThrow(root, ['checkout', '-b', `change/${slug}`]);
  const who = gitUser(root);
  const fields: Record<string, string> = { change: slug, created: new Date().toISOString().slice(0, 10), author: who.name ?? who.email ?? '' };
  if (opts.ticket) fields.ticket = opts.ticket;
  let body = setFrontmatter(templateFor(root, 'intent', localeOf(loaded)), fields);
  if (opts.title) body = body.replace(/^# (Intent: )?.*$/m, (_m, p: string | undefined) => `# ${p ?? ''}${opts.title}`);
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, 'intent.md'), body);
  console.log(`created ${dir}/intent.md${opts.branch ? ` on branch change/${slug}` : ''}`);
  console.log(loaded ? 'Next: fill it with your agent (/sdlc-intent) and ask the PO to accept it (sdlc approve).' : 'Note: project not configured (sdlc init).');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  const root = projectDir();

  // ci, vcs, tracker and bands print their own help
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
      const created = scaffold(root, { claudeMd: (config.agents ?? []).includes('claude'), locale });
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
      console.log(
        `  CI       ${ci ? `${ci.written.length} file(s) for ${provider}${ci.conflicts.length ? `, ${ci.conflicts.length} kept` : ''}; secret ${ciSecrets(config).join(', ')}` : provider ? 'skipped (--no-ci)' : 'no remote detected: `sdlc ci install --provider github|gitlab|bitbucket` later'}`,
      );
      if (typeof flags['first-change'] === 'string') {
        const title = flags['first-change'];
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'first-change';
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
      const config = JSON.parse(readFileSync(legacy, 'utf8'));
      config.locale ??= 'es';
      config.agents ??= ['claude'];
      writeConfig(root, config);
      rmSync(legacy);
      if (existsSync(join(root, '.claude/.sdlc-fix-lock'))) {
        ensureSdlcDir(root);
        writeFileSync(join(root, '.sdlc/fix-lock'), '');
        rmSync(join(root, '.claude/.sdlc-fix-lock'));
      }
      console.log(`moved ${LEGACY_CONFIG_PATH} → ${CONFIG_PATH}`);
      printSync(sync(root, requireConfig(root)));
      return;
    }

    case 'schema':
      console.log(JSON.stringify(configJsonSchema(), null, 2));
      return;

    case 'status': {
      if (flags.metrics) return printMetricsLegacy(root);
      const loaded = loadConfig(root);
      const locale = localeOf(loaded);
      const changes = listChanges(root, { locale, defaultBranch: loaded?.config.vcs?.default_branch });
      if (!changes.length) return void console.log(t(locale, 'status.empty'));
      for (const c of changes) {
        if (flags.json) console.log(JSON.stringify({ change: c.id, stage: c.stage, ticket: c.ticket ?? '', statuses: c.statuses, active: c.active, next: c.next }));
        else console.log(`${c.active ? '*' : ''}${c.id}\t${c.stage}\t${c.ticket ?? '-'}\t${c.statuses}`);
      }
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
      const m = metrics(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch });
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

    case 'approve':
    case 'reject': {
      const [change, artifact] = pos;
      if (!change || !ARTIFACTS.includes(artifact as Artifact)) fail(`usage: sdlc ${cmd} <change> <${ARTIFACTS.join('|')}> [-m comment]`);
      try {
        const r = decideGate(root, loadConfig(root), change, artifact as Artifact, cmd === 'approve' ? 'approved' : 'rejected', {
          comment: typeof flags.m === 'string' ? flags.m : undefined,
        });
        console.log(`${r.change}/${r.artifact}.md ${r.decision} by ${r.by} (${r.commit})`);
      } catch (e) {
        fail((e as Error).message);
      }
      return;
    }

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

function printMetricsLegacy(root: string, m = metrics(root)) {
  for (const c of m.changes) {
    const h = (x?: number) => (x === undefined ? '-' : x.toFixed(1));
    console.log(`${c.change}\tintent→spec: ${h(c.intentToSpecH)}h\tspec→plan: ${h(c.specToPlanH)}h\tspec rework post-plan: ${c.specReworkAfterPlan ?? '-'}`);
  }
}

main().catch((e) => {
  if (e instanceof SdlcError) {
    process.stderr.write(`sdlc: ${e.message}\n`);
    process.exit(e.exitCode);
  }
  fail((e as Error).stack ?? String(e));
});
