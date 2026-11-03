// `sdlc ci nightly-review`: the code nobody is changing gets reviewed too. One module per night, in rotation, with
// the review's finders and a verifier; each Important finding becomes an intent (origin: review) on its own branch,
// so it enters the loop like any other change instead of sitting in a report.
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitFiles, git, isCodePath, lines, localeOf, prCreate, setFrontmatter, type LoadedConfig } from '@ai-native-sdlc/core';
import { READ_TOOLS, runAgentAsync } from './agent.ts';
import { parseFindings, parseVotes, PASS_FOCUS, sameFinding, tally, type Finding, type Vote } from './review.ts';
import type { CiEnv } from './index.ts';
import { templateFor } from '../init.ts';

export const NIGHTLY_PASSES = ['bugs', 'security', 'tests'];
export const DEFAULT_MAX_INTENTS = 3;
/** Commit trailer of every intent this opens: how a finding already turned into a change is recognised. */
export const NIGHTLY_TRAILER = 'Nightly-Finding';

const CONTAINERS = ['src', 'lib', 'app', 'packages', 'services', 'internal', 'pkg', 'cmd'];
const SKIP = /^(\.|tests?$|__tests__$|docs$|examples$|evals$|fixtures$|vendor$|node_modules$|dist$|build$|ops$|scripts$)/;

const log = (msg: string) => process.stderr.write(`[sdlc-ci] ${msg}\n`);

/** `ci.nightly.modules`, else every top-level code directory, and each child of src/, packages/, lib/… (files directly in them count as the parent). */
export function nightlyModules(root: string, loaded: LoadedConfig | undefined): string[] {
  const explicit = loaded?.config.ci?.nightly?.modules;
  if (explicit?.length) return explicit;
  const mods = new Set<string>();
  for (const f of lines(git(root, ['ls-files'])).filter(isCodePath)) {
    const p = f.split('/');
    if (p.length < 2 || SKIP.test(p[0]!)) continue;
    mods.add(CONTAINERS.includes(p[0]!) && p.length > 2 ? `${p[0]}/${p[1]}` : p[0]!);
  }
  return [...mods].sort();
}

/** Tonight's module: the rotation advances one module per calendar day (UTC). */
export function moduleFor(modules: string[], date: Date): string | undefined {
  return modules.length ? modules[Math.floor(date.getTime() / 86_400_000) % modules.length] : undefined;
}

const fingerprint = (f: Pick<Finding, 'file' | 'bug_class'>) => `${f.file}#${f.bug_class.toLowerCase()}`;

/** Findings already turned into an intent, on any branch the checkout has. */
function alreadyOpened(root: string): Set<string> {
  const out = git(root, ['log', '--all', `--grep=^${NIGHTLY_TRAILER}: `, '--format=%B']) ?? '';
  return new Set([...out.matchAll(new RegExp(`^${NIGHTLY_TRAILER}: (.+)$`, 'gm'))].map((m) => m[1]!.trim()));
}

function finderPrompt(module: string, pass: string): string {
  return `You are a review finder for existing code: there is no diff, read the module ${module} (git ls-files ${module}) and what it calls.
Your pass: ${PASS_FOCUS[pass]}. Follow REVIEW.md (what Important means, what not to report).
Report only what you can prove: a file and line, and the code or the reasoning that shows the problem. severity: important (breaks behavior, leaks data, violates a policy) or nit (minor; never formatting or what lint checks). bug_class: a short name for the kind of bug (off-by-one, missing authorization check, unhandled error…). At most ten findings, the most serious first.
Do not modify any file. Answer only with a JSON array, [] if you found nothing:
[{"severity": "important", "file": "src/a.ts", "line": 12, "title": "one line", "evidence": "why it is wrong", "bug_class": "off-by-one"}]`;
}

function verifierPrompt(module: string, candidates: Finding[]): string {
  const j = JSON.stringify(candidates.map(({ id, severity, file, line, title, evidence }) => ({ id, severity, file, line, title, evidence })));
  return `You are the review verifier for a review of existing code in ${module}. Check each finding against the code at HEAD (read the files).
Candidates: ${j}
For each one vote keep (real, the evidence holds, and it matters) or drop (wrong, not supported by the code, a duplicate, or only style, naming or formatting). You may correct the severity (important, nit).
Do not modify any file. Answer only with a JSON array: [{"id": "n1", "vote": "keep|drop", "severity": "important", "reason": "short"}]`;
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'finding';

function intentFor(root: string, loaded: LoadedConfig | undefined, module: string, f: Finding, slug: string, now: Date): string {
  const title = `${f.bug_class} in ${f.file}`;
  const detected = [
    `> Found by the nightly review of \`${module}\` (\`sdlc ci nightly-review\`) on ${now.toISOString().slice(0, 10)}. Confirm it, then decide: fix (/sdlc-fix or the full loop), schedule, or reject this intent with the reason.`,
    '',
    '### Finding',
    `- **Important** · ${f.bug_class} · \`${f.file}:${f.line}\` (pass: ${f.pass})`,
    `- ${f.title}`,
    ...(f.evidence ? [`- Evidence: ${f.evidence}`] : []),
    '',
  ].join('\n');
  const intent = setFrontmatter(templateFor(root, 'intent', localeOf(loaded)), {
    change: slug,
    status: 'draft',
    origin: 'review',
    author: 'sdlc nightly review',
    created: now.toISOString().slice(0, 10),
  });
  return intent.replace(/^# (.*)$/m, (_m, h: string) => `# ${/<[^>]*>/.test(h) ? h.replace(/<[^>]*>/, title) : title}\n\n${detected}`);
}

export interface NightlyResult {
  module?: string;
  findings: Finding[];
  intents: { finding: string; change: string; branch: string; pr?: string }[];
  skipped: string[];
}

export async function nightlyReview(c: CiEnv, flags: Record<string, string | true>): Promise<number> {
  const modules = nightlyModules(c.root, c.loaded);
  const module = typeof flags.module === 'string' ? flags.module : moduleFor(modules, new Date());
  const result: NightlyResult = { module, findings: [], intents: [], skipped: [] };
  if (!module) {
    log('no modules to review (set ci.nightly.modules)');
    return 0;
  }
  log(`nightly review of ${module} (${modules.length} module${modules.length === 1 ? '' : 's'} in rotation)`);
  const run = (prompt: string) => runAgentAsync(c.agent, { mode: 'read', allowedTools: READ_TOOLS, cwd: c.root, prompt }, c.model).catch((e: Error) => (log(e.message), ''));

  const found = (await Promise.all(NIGHTLY_PASSES.map(async (p) => parseFindings(await run(finderPrompt(module, p)), p)))).flat();
  const candidates: Finding[] = [];
  for (const f of found)
    if (f.severity !== 'pre_existing' && !candidates.some((k) => sameFinding(k, f))) candidates.push({ ...f, id: `n${candidates.length + 1}` });
  const ballots = candidates.length ? [parseVotes(await run(verifierPrompt(module, candidates)))].filter((b): b is Vote[] => !!b) : [];
  result.findings = candidates.flatMap((f) => {
    const t = tally(ballots, f.id, 'keep');
    return t.pass ? [{ ...f, severity: t.severity ?? f.severity }] : [];
  });

  const max = c.loaded?.config.ci?.nightly?.max_intents ?? DEFAULT_MAX_INTENTS;
  const opened = alreadyOpened(c.root);
  const now = new Date();
  const def = c.loaded?.config.vcs?.default_branch ?? 'main';
  const from = git(c.root, ['rev-parse', '--verify', '-q', `origin/${def}`]) ? `origin/${def}` : git(c.root, ['rev-parse', '--verify', '-q', def]) ? def : 'HEAD';
  const remote = !!git(c.root, ['remote', 'get-url', 'origin']);
  for (const f of result.findings.filter((x) => x.severity === 'important')) {
    const fp = fingerprint(f);
    if (opened.has(fp)) {
      result.skipped.push(`${f.id} ${fp}: an intent already exists`);
      continue;
    }
    if (result.intents.length >= max) {
      result.skipped.push(`${f.id} ${fp}: ci.nightly.max_intents (${max}) reached`);
      continue;
    }
    const slug = `review-${slugify(f.bug_class)}-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${result.intents.length + 1}`;
    const dir = `changes/${now.toISOString().slice(0, 7)}-${slug}`;
    const branch = `change/${slug}`;
    if (c.dryRun) {
      result.intents.push({ finding: f.id, change: dir, branch });
      continue;
    }
    const intent = intentFor(c.root, c.loaded, module, f, slug, now);
    commitFiles(c.root, branch, { [`${dir}/intent.md`]: intent }, `chore(${slug}): intent from the nightly review of ${module}\n\n${f.title}\n\n${NIGHTLY_TRAILER}: ${fp}`, from);
    opened.add(fp);
    const entry: NightlyResult['intents'][number] = { finding: f.id, change: dir, branch };
    if (remote) {
      git(c.root, ['push', '-q', 'origin', `${branch}:${branch}`]);
      if (flags.pr) {
        try {
          entry.pr = await prCreate({ root: c.root, loaded: c.loaded, env: c.env }, { title: `Intent: ${f.bug_class} in ${f.file}`, body: intent.replace(/^---[\s\S]*?---\n/, ''), base: def, head: branch, draft: true });
        } catch (e) {
          log(`could not open the PR for ${branch}: ${(e as Error).message}`);
        }
      }
    }
    result.intents.push(entry);
  }

  writeFileSync(join(c.root, 'nightly-review.json'), JSON.stringify(result, null, 2) + '\n');
  const report = renderNightly(result, modules.length);
  console.log(report);
  if (c.env.GITHUB_STEP_SUMMARY) appendFileSync(c.env.GITHUB_STEP_SUMMARY, report + '\n');
  return 0;
}

export function renderNightly(r: NightlyResult, total: number): string {
  const important = r.findings.filter((f) => f.severity === 'important');
  const out = [`## Nightly review: ${r.module}`, '', `Important: ${important.length} · Nit: ${r.findings.length - important.length} · ${total} module${total === 1 ? '' : 's'} in rotation`];
  if (r.findings.length) {
    out.push('', '| Id | Severity | File:line | Finding | Bug class |', '|---|---|---|---|---|');
    for (const f of r.findings) out.push(`| ${f.id} | ${f.severity === 'important' ? 'Important' : 'Nit'} | \`${f.file}:${f.line}\` | ${f.title.replace(/\|/g, '\\|')} | ${f.bug_class} |`);
  }
  for (const i of r.intents) out.push('', `Intent for ${i.finding}: \`${i.change}/intent.md\` on \`${i.branch}\`${i.pr ? ` (${i.pr})` : ''}`);
  for (const s of r.skipped) out.push('', `Skipped ${s}`);
  return out.join('\n');
}
