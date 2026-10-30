// `sdlc bands check`: read ops/bands.yaml, evaluate every band, act on the broken ones by tier.
//   1σ log       → activity event
//   2σ diagnose  → read-only agent run (sdlc-incident, diagnosis only)
//   3σ propose   → incident intent (origin: incident) committed on change/<slug>, pushed; draft PR when routed
// Nothing here runs a runbook or touches production: those stay behind a human (/sdlc-incident step 2).
import { execFileSync } from 'node:child_process';
import {
  BANDS_PATH,
  checkBands,
  commitFiles,
  git,
  lines,
  loadBands,
  loadConfig,
  localeOf,
  prCreate,
  recordEvent,
  RULE_TEXT,
  SdlcError,
  setFrontmatter,
  tierFor,
  type BandConfig,
  type BandResult,
  type BandTier,
  type LoadedConfig,
} from '@ai-native-sdlc/core';
import { pickAgent, runAgent, skillRef } from './ci/agent.ts';
import { templateFor } from './init.ts';

export interface BandAction {
  metric: string;
  sigma: 1 | 2 | 3;
  action: BandTier['action'];
  diagnosis?: string;
  change?: string;
  branch?: string;
  pr?: string;
  skipped?: string;
}

const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : n === Infinity ? '+∞' : n === -Infinity ? '-∞' : '–');

function evidence(band: BandConfig, r: BandResult): string {
  return [
    `- Metric: \`${band.metric}\`${band.description ? ` — ${band.description}` : ''}`,
    `- Latest value: ${fmt(r.value)} (baseline mean ${fmt(r.mean)}, σ ${fmt(r.sigma)}, z ${fmt(r.z)}, ${r.points} points)`,
    `- Rule: ${RULE_TEXT[r.rule!]} (Western Electric ${r.rule}) → ${r.level}σ tier`,
    `- Direction that counts as bad: ${band.direction}`,
  ].join('\n');
}

function diagnose(root: string, loaded: LoadedConfig | undefined, agentFlag: string | undefined, band: BandConfig, r: BandResult, tools: string | undefined): string {
  const agent = pickAgent(agentFlag, loaded);
  return runAgent(
    agent,
    {
      mode: 'read',
      cwd: root,
      allowedTools: tools ?? 'Read,Grep,Glob,Bash(git log:*),Bash(git diff:*),Bash(git show:*)',
      prompt: `Use ${skillRef(agent, 'sdlc-incident')} in headless mode, diagnosis only (step 1): do not modify files or run anything with side effects.
The control band for ${band.metric} broke:
${evidence(band, r)}
Answer in markdown, at most 15 lines: probable cause, evidence (commits, logs, files), confidence (low/medium/high), and the recommended next step.`,
    },
    loaded?.config.ci?.model,
  );
}

const incidentPrefix = (metric: string) => `incident-${metric.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;

function openIncident(root: string, metric: string): string | undefined {
  const pattern = `change/${incidentPrefix(metric)}-*`;
  const local = lines(git(root, ['branch', '--list', pattern, '--format=%(refname:short)']));
  const remote = lines(git(root, ['ls-remote', '--heads', 'origin', pattern])).map((l) => l.split('refs/heads/')[1]);
  return [...local, ...remote].find(Boolean);
}

async function propose(root: string, loaded: LoadedConfig | undefined, band: BandConfig, r: BandResult, tier: BandTier, diagnosis: string | undefined, dryRun: boolean): Promise<Partial<BandAction>> {
  const open = openIncident(root, band.metric);
  if (open) return { skipped: `incident already open on ${open}` };
  const now = new Date();
  const slug = `${incidentPrefix(band.metric)}-${now.toISOString().slice(0, 10).replaceAll('-', '')}`;
  const dir = `changes/${now.toISOString().slice(0, 7)}-${slug}`;
  const branch = `change/${slug}`;
  const runbooks = (tier.routes ?? []).filter((x) => x.startsWith('runbook:')).map((x) => x.slice('runbook:'.length));
  const title = `${band.metric} out of its control band`;
  const detected = [
    `> Detected by \`sdlc bands check\` (${BANDS_PATH}) on ${now.toISOString()}. Continue with /sdlc-incident: confirm the diagnosis, fill in the sections, decide fix now / schedule / dismiss.`,
    '',
    '### Evidence',
    evidence(band, r),
    ...(diagnosis ? ['', '### Automated diagnosis (read-only)', diagnosis] : []),
    ...(runbooks.length ? ['', '### Pre-approved runbooks (a human runs them)', ...runbooks.map((n) => `- \`ops/runbooks/${n}.md\``)] : []),
    '',
  ].join('\n');
  let intent = setFrontmatter(templateFor(root, 'intent', localeOf(loaded)), {
    change: slug,
    status: 'draft',
    origin: 'incident',
    author: 'sdlc bands',
    created: now.toISOString().slice(0, 10),
  });
  intent = intent.replace(/^# (.*)$/m, (_m, h: string) => `# ${/<[^>]*>/.test(h) ? h.replace(/<[^>]*>/, title) : title}\n\n${detected}`);
  if (dryRun) return { change: dir, branch, skipped: 'dry run' };

  const def = loaded?.config.vcs?.default_branch ?? 'main';
  const from = git(root, ['rev-parse', '--verify', '-q', `origin/${def}`]) ? `origin/${def}` : git(root, ['rev-parse', '--verify', '-q', def]) ? def : 'HEAD';
  commitFiles(root, branch, { [`${dir}/intent.md`]: intent }, `chore(${slug}): incident intent from band ${band.metric}\n\n${RULE_TEXT[r.rule!]}, z ${fmt(r.z)}`, from);
  const out: Partial<BandAction> = { change: dir, branch };
  if (git(root, ['remote', 'get-url', 'origin'])) {
    execFileSync('git', ['push', '-q', 'origin', `${branch}:${branch}`], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    if (tier.routes?.includes('pull_request'))
      out.pr = await prCreate({ root, loaded }, { title: `Incident: ${title}`, body: detected, base: def, head: branch, draft: true });
  }
  return out;
}

export async function bandsCommand(root: string, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const flag = (f: string) => rest.includes(`--${f}`);
  const agentIdx = rest.indexOf('--agent');
  const agentFlag = agentIdx >= 0 ? rest[agentIdx + 1] : undefined;
  if (sub !== 'check') {
    process.stderr.write('usage: sdlc bands check [--json] [--dry-run] [--no-agent] [--agent claude|codex|cursor]\n');
    return 1;
  }
  const file = loadBands(root);
  if (!file || !file.bands.length) {
    console.log(`No bands in ${BANDS_PATH}. Define them once the service has metrics with a stable baseline.`);
    return 0;
  }
  const loaded = loadConfig(root);
  const dryRun = flag('dry-run');
  const results = await checkBands(root, file, { record: !dryRun });
  const actions: BandAction[] = [];

  for (const r of results) {
    if (r.status !== 'broken') continue;
    const band = file.bands.find((b) => b.metric === r.metric)!;
    const picked = tierFor(band, r.level);
    if (!picked) continue;
    const a: BandAction = { metric: r.metric, sigma: picked.sigma, action: picked.tier.action };
    try {
      if (!dryRun && !flag('no-agent') && (a.action === 'diagnose' || (a.action === 'propose' && picked.tier.tools)))
        a.diagnosis = diagnose(root, loaded, agentFlag, band, r, picked.tier.tools);
      if (a.action === 'propose') Object.assign(a, await propose(root, loaded, band, r, picked.tier, a.diagnosis, dryRun));
    } catch (e) {
      a.skipped = (e as Error).message;
    }
    if (!dryRun)
      recordEvent(root, {
        type: 'band.break',
        metric: r.metric,
        change: a.change,
        detail: `${RULE_TEXT[r.rule!]} · z ${fmt(r.z)} → ${a.sigma}σ ${a.action}${a.skipped ? ` (${a.skipped})` : ''}`,
      });
    actions.push(a);
  }

  if (flag('json')) console.log(JSON.stringify({ results, actions }, null, 2));
  else {
    for (const r of results) {
      const state = r.status === 'error' ? `error: ${r.error}` : r.status === 'insufficient' ? `not enough data (${r.points} points)` : r.status === 'ok' ? 'ok' : `BROKEN ${r.level}σ (${RULE_TEXT[r.rule!]})`;
      console.log(`${r.metric.padEnd(28)} ${fmt(r.value).padStart(10)}  mean ${fmt(r.mean)} σ ${fmt(r.sigma)} z ${fmt(r.z)}  ${state}`);
    }
    for (const a of actions) {
      console.log(`\n→ ${a.metric}: ${a.sigma}σ ${a.action}${a.skipped ? ` — ${a.skipped}` : ''}`);
      if (a.change) console.log(`  intent: ${a.change}/intent.md on ${a.branch}`);
      if (a.pr) console.log(`  draft PR: ${a.pr}`);
      if (a.diagnosis) console.log(a.diagnosis.replace(/^/gm, '  '));
    }
  }
  return results.some((r) => r.status === 'error') ? 1 : 0;
}
