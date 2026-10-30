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
import { askConfig, detectConfig, scaffold, templateFor } from './init.ts';
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
  init [--yes] [--locale en|es]      detect stack/VCS/agents, write .sdlc/config.json, scaffold, sync
  sync [--force] [--dry-run]         regenerate agent files (Claude, Cursor, AGENTS.md) and git hooks
  doctor [--json]                    health checks + enforcement matrix per agent
  migrate                            .claude/sdlc.json → .sdlc/config.json
  schema                             JSON Schema of .sdlc/config.json

Loop
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
      else if (['agent', 'port', 'ticket', 'title', 'locale'].includes(k)) flags[k] = argv[++i] ?? '';
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
      let config = detectConfig(root, locale);
      if (!flags.yes && process.stdin.isTTY) config = await askConfig(config);
      writeConfig(root, config);
      console.log(`wrote ${CONFIG_PATH}`);
      const created = scaffold(root, { claudeMd: (config.agents ?? []).includes('claude'), locale });
      for (const p of created) console.log(`  scaffold  ${p}`);
      printSync(sync(root, requireConfig(root)));
      console.log('\nNext: review .sdlc/config.json (or `sdlc ui` → Settings), then open your agent and run /sdlc-setup to finish CLAUDE.md/REVIEW.md/CI, or /sdlc-intent to start a change.');
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

    case 'metrics': {
      const loaded = loadConfig(root);
      const m = metrics(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch });
      if (flags.json) return void console.log(JSON.stringify(m, null, 2));
      return printMetricsLegacy(root, m);
    }

    case 'new': {
      const slug = pos[0];
      if (!slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) fail('usage: sdlc new <slug> (letters, digits, dashes)');
      const loaded = loadConfig(root);
      const dir = `changes/${new Date().toISOString().slice(0, 7)}-${slug}`;
      if (existsSync(join(root, dir))) fail(`${dir} already exists`);
      if (!flags['no-branch']) gitOrThrow(root, ['checkout', '-b', `change/${slug}`]);
      const who = gitUser(root);
      const fields: Record<string, string> = { change: slug, created: new Date().toISOString().slice(0, 10), author: who.name ?? who.email ?? '' };
      if (typeof flags.ticket === 'string') fields.ticket = flags.ticket;
      let body = setFrontmatter(templateFor(root, 'intent', localeOf(loaded)), fields);
      if (typeof flags.title === 'string') body = body.replace(/^# (Intent: )?.*$/m, (_m, p: string | undefined) => `# ${p ?? ''}${flags.title}`);
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'intent.md'), body);
      console.log(`created ${dir}/intent.md${flags['no-branch'] ? '' : ` on branch change/${slug}`}`);
      console.log(loaded ? 'Next: fill it with your agent (/sdlc-intent) and ask the PO to accept it (sdlc approve).' : 'Note: project not configured (sdlc init).');
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
