// `sdlc ci review` and `sdlc ci security`: several finders (one per pass) look for problems in parallel, a verifier
// votes on each candidate and drops what the code does not support or is only style. Depth follows the risk tier;
// re-reviews look only at the commits since the last round, never repeat a finding, and stop at a round cap.
// `sdlc/review` fails while an Important or security finding is open: it closes when the verifier sees it fixed,
// or with a `resolved: <reason>` reply from a maintainer.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  commitStatus,
  git,
  isAgent,
  isTrustedAuthor,
  notify,
  prInlineComments,
  prThread,
  prUpsertComment,
  SdlcError,
  type LoadedConfig,
  type RiskTier,
  type ThreadComment,
} from '@ai-native-sdlc/core';
import { READ_TOOLS, runAgentAsync } from './agent.ts';
import { changeForBranch } from './gates.ts';
import { baseCommit, prRisk } from './risk.ts';
import { baseRef, headRef, prNumber, type CiEnv } from './index.ts';
import { findChange } from '../notify.ts';

export type ReviewKind = 'review' | 'security';

export const REVIEW_HEADER = '## Automated review (ai-sdlc)';
export const REVIEW_MARKER = '<!-- sdlc:review-summary -->';
export const SECURITY_HEADER = '## Security review (ai-sdlc)';
export const SECURITY_MARKER = '<!-- sdlc:security-summary -->';
export const REVIEW_STATUS = 'sdlc/review';

export const SEVERITIES = ['important', 'nit', 'pre_existing'] as const;
export type Severity = (typeof SEVERITIES)[number];
const LABEL: Record<Severity, string> = { important: 'Important', nit: 'Nit', pre_existing: 'Pre-existing' };

export type Depth = 'quick' | 'standard' | 'deep';
const DEPTH_LABEL: Record<Depth, string> = { quick: 'Quick', standard: 'Standard', deep: 'Deep' };

interface KindSpec {
  header: string;
  marker: string;
  state: RegExp;
  stateTag: string;
  idPrefix: string;
  role: string;
  passes: Record<Depth, string[]>;
  votes: Record<Depth, number>;
}

export const KINDS: Record<ReviewKind, KindSpec> = {
  review: {
    header: REVIEW_HEADER,
    marker: REVIEW_MARKER,
    state: /<!-- sdlc:review-state ([A-Za-z0-9+/=]+) -->/,
    stateTag: 'review-state',
    idPrefix: 'f',
    role: 'a review finder',
    passes: { quick: ['all'], standard: ['bugs', 'security', 'compliance'], deep: ['bugs', 'security', 'compliance', 'tests', 'regressions'] },
    votes: { quick: 1, standard: 1, deep: 3 },
  },
  security: {
    header: SECURITY_HEADER,
    marker: SECURITY_MARKER,
    state: /<!-- sdlc:security-state ([A-Za-z0-9+/=]+) -->/,
    stateTag: 'security-state',
    idPrefix: 's',
    role: 'a security review finder',
    passes: { quick: ['security_all'], standard: ['injection', 'access', 'data'], deep: ['injection', 'access', 'data'] },
    votes: { quick: 1, standard: 1, deep: 3 },
  },
};
/** Passes per depth of the general review (the docs table). */
export const DEPTHS = Object.fromEntries((['quick', 'standard', 'deep'] as const).map((d) => [d, { label: DEPTH_LABEL[d], passes: KINDS.review.passes[d], votes: KINDS.review.votes[d] }])) as Record<
  Depth,
  { label: string; passes: string[]; votes: number }
>;
const TIER_DEPTH: Record<RiskTier, Depth> = { low: 'quick', medium: 'standard', high: 'deep' };
const PASS_FOCUS: Record<string, string> = {
  all: 'every pass in REVIEW.md (Bugs, Security, Compliance)',
  bugs: 'Bugs: logic errors, broken edge cases, subtle regressions',
  security: 'Security: injection, authentication or authorization gaps, PII in logs or errors, secrets',
  compliance: 'Compliance: the diff against changes/<slug>/spec.md and plan.md and the principles in CLAUDE.md; a deviation from the plan that plan.md does not record is a finding',
  tests: 'Tests: behavior the spec requires that no test covers, tests that cannot fail, a reproduction test changed after its commit',
  regressions: 'Regressions: callers and modules outside the diff that this change breaks (read them)',
  security_all: 'every security check: injection and unsafe input, access control, data exposure and secrets',
  injection: 'Injection and unsafe input: SQL, command or template injection, path traversal, SSRF, unsafe deserialization, XSS',
  access: 'Access control: missing authentication or authorization checks, privilege escalation, objects reachable by id without an ownership check, session and token handling',
  data: 'Data exposure and secrets: secrets in code or config, PII in logs or errors, weak cryptography, risky dependencies, CI workflows with more permissions than they need',
};
const MAX_NITS = 5;
export const DEFAULT_MAX_ROUNDS = 3;

export interface Finding {
  id: string;
  severity: Severity;
  file: string;
  line: number;
  title: string;
  evidence: string;
  bug_class: string;
  pass: string;
}

export interface StoredFinding extends Finding {
  status: 'open' | 'fixed' | 'resolved';
  round: number;
  resolved_by?: string;
  reason?: string;
}

export interface ReviewState {
  round: number;
  sha: string;
  findings: StoredFinding[];
}

const log = (msg: string) => process.stderr.write(`[sdlc-ci] ${msg}\n`);

/** The JSON array in an agent answer: a ```json block, else the outermost [...]. */
export function parseJsonArray(out: string): unknown[] | undefined {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(out)?.[1];
  const text = fenced ?? out.slice(out.indexOf('['), out.lastIndexOf(']') + 1);
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function parseFindings(out: string, pass: string): Omit<Finding, 'id'>[] {
  return (parseJsonArray(out) ?? []).flatMap((x) => {
    const f = x as Record<string, unknown>;
    const severity = String(f.severity ?? '').toLowerCase().replace(/[- ]/g, '_') as Severity;
    const line = Number(f.line);
    if (!SEVERITIES.includes(severity) || typeof f.file !== 'string' || !f.file || !Number.isInteger(line) || line < 1 || typeof f.title !== 'string') return [];
    const p = pass === 'all' ? String(f.pass ?? 'bugs').toLowerCase() : pass === 'security_all' ? 'security' : pass;
    return [{ severity, file: f.file.replace(/^\.?\//, ''), line, title: f.title.trim(), evidence: String(f.evidence ?? '').trim(), bug_class: String(f.bug_class ?? 'unclassified').trim().toLowerCase(), pass: p }];
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Same problem reported again: same file and bug class a few lines away, or the same title in the same file. */
export function sameFinding(a: Pick<Finding, 'file' | 'line' | 'title' | 'bug_class'>, b: Pick<Finding, 'file' | 'line' | 'title' | 'bug_class'>): boolean {
  if (a.file !== b.file) return false;
  return (a.bug_class === b.bug_class && Math.abs(a.line - b.line) <= 5) || norm(a.title) === norm(b.title);
}

/** Lines on the new side of `git diff range`, per file: where inline comments can go. */
export function changedLines(diff: string): Map<string, Set<number>> {
  const lines = new Map<string, Set<number>>();
  let file: string | undefined;
  for (const l of diff.split('\n')) {
    const f = /^\+\+\+ (?:b\/)?(.+)$/.exec(l);
    if (f) {
      file = f[1] === '/dev/null' ? undefined : f[1];
      continue;
    }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (h && file) {
      const set = lines.get(file) ?? new Set<number>();
      const start = Number(h[1]);
      for (let i = 0; i < Number(h[2] ?? 1); i++) set.add(start + i);
      lines.set(file, set);
    }
  }
  return lines;
}

export const encodeState = (s: ReviewState, kind: ReviewKind = 'review') => `<!-- sdlc:${KINDS[kind].stateTag} ${Buffer.from(JSON.stringify(s)).toString('base64')} -->`;

export const ours = (c: ThreadComment) => !c.association || c.author.endsWith('[bot]') || ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(c.association);

/** Our last review state on the PR. Only comments a bot or a maintainer wrote count, so nobody can fake one. */
export function stateFrom(thread: ThreadComment[], kind: ReviewKind = 'review'): ReviewState | undefined {
  const raw = thread
    .filter((c) => !c.path && ours(c))
    .map((c) => KINDS[kind].state.exec(c.body)?.[1])
    .filter(Boolean)
    .at(-1);
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as ReviewState;
  } catch {
    return undefined;
  }
}

export interface Resolution {
  id: string;
  by: string;
  reason: string;
}

/** Who may close a finding with a reason: owners, members and collaborators (GitHub), else trusted authors. Never an agent. */
export function canResolve(c: ThreadComment, loaded: LoadedConfig | undefined): boolean {
  if (isAgent({ login: c.author, name: c.author }) || c.author.endsWith('[bot]')) return false;
  if (c.association) return ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(c.association);
  return isTrustedAuthor(loaded, { login: c.author });
}

const FINDING_ID = /<!-- sdlc:finding id=([fs]\d+) -->/;
const RESOLVED = /^resolved((?:[\s,]+[fs]\d+)*)\s*:\s*(\S[\s\S]*)$/i;

/**
 * `resolved: <reason>` in reply to a finding's inline comment, or `resolved f2 s1: <reason>` anywhere on the PR.
 * A reason is required; comments from people who cannot resolve are ignored.
 */
export function resolutions(thread: ThreadComment[], loaded: LoadedConfig | undefined): Map<string, Resolution> {
  const byId = new Map(thread.map((c) => [c.id, c]));
  const out = new Map<string, Resolution>();
  for (const c of thread) {
    const m = RESOLVED.exec(c.body.trim());
    if (!m || !canResolve(c, loaded)) continue;
    let ids = m[1].split(/[\s,]+/).filter(Boolean);
    if (!ids.length && c.replyTo) {
      const id = FINDING_ID.exec(byId.get(c.replyTo)?.body ?? '')?.[1];
      if (id) ids = [id];
    }
    for (const id of ids) out.set(id, { id, by: c.author, reason: m[2].trim().split('\n')[0] });
  }
  return out;
}

function applyResolutions(findings: StoredFinding[], res: Map<string, Resolution>): StoredFinding[] {
  return findings.map((f) => {
    const r = res.get(f.id);
    return f.status === 'open' && r ? { ...f, status: 'resolved' as const, resolved_by: r.by, reason: r.reason } : f;
  });
}

/** Findings that keep `sdlc/review` red: open Important ones, and open security findings that are not pre-existing. */
export function blocking(kind: ReviewKind, findings: StoredFinding[]): StoredFinding[] {
  return findings.filter((f) => f.status === 'open' && (f.severity === 'important' || (kind === 'security' && f.severity !== 'pre_existing')));
}

function finderPrompt(kind: ReviewKind, pass: string, range: string, full: string, branch: string, known: StoredFinding[]): string {
  return `You are ${KINDS[kind].role} for this PR/MR. Your pass: ${PASS_FOCUS[pass]}. Follow REVIEW.md (what Important means, what not to report).
Diff to review: git diff ${range}.${range === full ? '' : ` These are only the commits since the last review round; git diff ${full} is the whole PR, for context only.`}
Read changes/<slug>/spec.md and plan.md for the change on the branch ${branch}.
${known.length ? `Already reported (do not report them again, even reworded):\n${known.map((f) => `- ${f.file}:${f.line} [${f.bug_class}] ${f.title}`).join('\n')}\n` : ''}Report only what you can prove: a file and line, and the code or the reasoning that shows the problem. severity: important (breaks behavior, leaks data, violates a policy), nit (minor; never formatting or what lint checks), pre_existing (a real problem in code this PR did not change). bug_class: a short name for the kind of bug (off-by-one, missing authorization check, unhandled error, race condition…).
Do not modify any file. Answer only with a JSON array, [] if you found nothing:
[{"severity": "important", "file": "src/a.ts", "line": 12, "title": "one line", "evidence": "why it is wrong", "bug_class": "off-by-one"${pass === 'all' ? ', "pass": "bugs|security|compliance"' : ''}}]`;
}

function verifierPrompt(full: string, candidates: Finding[], open: StoredFinding[]): string {
  const j = (fs: Finding[]) => JSON.stringify(fs.map(({ id, severity, file, line, title, evidence }) => ({ id, severity, file, line, title, evidence })));
  return `You are the review verifier for this PR/MR. Check each finding against the code at HEAD (git diff ${full}, and read the files).
${candidates.length ? `New candidates: ${j(candidates)}
For each one vote keep (real, the evidence holds, and it matters) or drop (wrong, not supported by the code, a duplicate, or only style, naming or formatting). You may correct the severity (important, nit, pre_existing).\n` : ''}${
    open.length ? `Findings still open from earlier rounds: ${j(open)}
For each one vote open (the problem is still in the code) or fixed (it is gone).\n` : ''
  }Do not modify any file. Answer only with a JSON array: [{"id": "f1", "vote": "keep|drop|open|fixed", "severity": "important", "reason": "short"}]`;
}

interface Vote {
  id: string;
  vote: string;
  severity?: Severity;
}

function parseVotes(out: string): Vote[] | undefined {
  const arr = parseJsonArray(out);
  if (!arr) return undefined;
  return arr.flatMap((x) => {
    const v = x as Record<string, unknown>;
    const severity = String(v.severity ?? '').toLowerCase().replace(/[- ]/g, '_') as Severity;
    return typeof v.id === 'string' ? [{ id: v.id, vote: String(v.vote ?? '').toLowerCase(), severity: SEVERITIES.includes(severity) ? severity : undefined }] : [];
  });
}

/** Majority of the ballots that voted on `id`. No ballot on it: the finding stands. */
export function tally(ballots: Vote[][], id: string, yes: string): { pass: boolean; severity?: Severity } {
  const votes = ballots.map((b) => b.find((v) => v.id === id)).filter((v): v is Vote => !!v);
  if (!votes.length) return { pass: true };
  const ayes = votes.filter((v) => v.vote === yes);
  const counts = new Map<Severity, number>();
  for (const v of ayes) if (v.severity) counts.set(v.severity, (counts.get(v.severity) ?? 0) + 1);
  const severity = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { pass: ayes.length * 2 > votes.length, severity };
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

export function counts(findings: StoredFinding[]): string {
  const open = findings.filter((f) => f.status === 'open');
  return SEVERITIES.map((s) => `${LABEL[s]}: ${open.filter((f) => f.severity === s).length}`).join(' · ');
}

export function renderReview(
  state: ReviewState,
  o: { kind?: ReviewKind; depth: Depth; tier: RiskTier; since?: string; capped: boolean; maxRounds: number; fixed: StoredFinding[]; dropped: number; outside: StoredFinding[] },
): string {
  const kind = o.kind ?? 'review';
  const open = state.findings.filter((f) => f.status === 'open');
  const order = (f: StoredFinding) => SEVERITIES.indexOf(f.severity);
  const nits = open.filter((f) => f.severity === 'nit');
  const shown = [...open.filter((f) => f.severity !== 'nit'), ...nits.slice(0, MAX_NITS)].sort((a, b) => order(a) - order(b) || a.file.localeCompare(b.file) || a.line - b.line);
  const scope = o.since ? `only the commits since ${o.since.slice(0, 7)}` : 'the whole PR';
  const lines = [
    KINDS[kind].header,
    '',
    counts(state.findings),
    '',
    `Round ${state.round} of ${o.maxRounds} · ${DEPTH_LABEL[o.depth]} review (risk ${o.tier}) · ${state.sha.slice(0, 7)}, ${scope}`,
  ];
  if (shown.length) {
    lines.push('', '| Id | Severity | File:line | Finding | Bug class | Pass |', '|---|---|---|---|---|---|');
    for (const f of shown) lines.push(`| ${f.id} | ${LABEL[f.severity]} | \`${f.file}:${f.line}\` | ${cell(f.title)}${f.evidence ? ` — ${cell(f.evidence)}` : ''} | ${cell(f.bug_class)} | ${f.pass} |`);
    if (nits.length > MAX_NITS) lines.push('', `${nits.length - MAX_NITS} more nits not shown.`);
  } else lines.push('', 'No open findings.');
  if (o.fixed.length) lines.push('', `Fixed since the last round: ${o.fixed.map((f) => `\`${f.file}:${f.line}\` ${cell(f.title)}`).join('; ')}`);
  const resolved = state.findings.filter((f) => f.status === 'resolved');
  if (resolved.length) lines.push('', `Resolved with a reason: ${resolved.map((f) => `${f.id} by @${f.resolved_by} (${cell(f.reason ?? '')})`).join('; ')}`);
  if (o.dropped) lines.push('', `The verifier dropped ${o.dropped} candidate${o.dropped === 1 ? '' : 's'} (not supported by the code, or only style).`);
  if (o.outside.length) lines.push('', `Not on lines of this diff, so only listed here: ${o.outside.map((f) => `\`${f.file}:${f.line}\``).join(', ')}.`);
  if (o.capped) lines.push('', `Round cap reached (${o.maxRounds}): no new findings are looked for; the verifier only checks whether the open ones were fixed. A person reviews the rest.`);
  lines.push(
    '',
    `\`${REVIEW_STATUS}\` stays red while an Important${kind === 'security' ? ' or security' : ''} finding is open. Fix it, or reply \`resolved: <reason>\` to its comment (or \`resolved <id>: <reason>\` here); only maintainers can resolve.`,
    '',
    KINDS[kind].marker,
    encodeState(state, kind),
  );
  return lines.join('\n');
}

const headSha = (c: CiEnv) => c.env.HEAD_SHA || git(c.root, ['rev-parse', 'HEAD']) || 'HEAD';

export async function review(c: CiEnv, kind: ReviewKind = 'review'): Promise<number> {
  const n = prNumber(c.env);
  if (n === undefined) {
    log('not a PR/MR, nothing to review');
    return 0;
  }
  const spec = KINDS[kind];
  const ctx = { root: c.root, loaded: c.loaded, env: c.env };
  const baseName = baseRef(c);
  git(c.root, ['fetch', '-q', 'origin', baseName]);
  const base = baseCommit(c.root, baseName);
  const branch = headRef(c);
  const head = headSha(c);
  const change = changeForBranch(c, branch);
  const risk = await prRisk(c, change, n);
  const setting = c.loaded?.config.ci?.review;
  const depth: Depth = setting?.depth && setting.depth !== 'auto' ? setting.depth : TIER_DEPTH[risk.tier];
  const maxRounds = setting?.max_rounds ?? DEFAULT_MAX_ROUNDS;

  let thread: ThreadComment[] = [];
  if (!c.dryRun) {
    try {
      thread = await prThread(ctx, n);
    } catch (e) {
      log(`could not read the PR comments: ${(e as Error).message}`);
    }
  }
  const prev = stateFrom(thread, kind);
  if (prev?.sha === head) {
    log(`${head.slice(0, 7)} was already reviewed (round ${prev.round})`);
    if (!c.dryRun) await reviewStatus(c, thread);
    return 0;
  }
  const round = (prev?.round ?? 0) + 1;
  const capped = round > maxRounds;
  const since = prev && git(c.root, ['merge-base', '--is-ancestor', prev.sha, head]) !== undefined ? prev.sha : undefined;
  const full = `${base}...HEAD`;
  const range = since ? `${since}..HEAD` : full;
  const known = applyResolutions(prev?.findings ?? [], resolutions(thread, c.loaded));
  const run = (prompt: string) => runAgentAsync(c.agent, { mode: 'read', allowedTools: READ_TOOLS, cwd: c.root, prompt }, c.model).catch((e: Error) => (log(e.message), ''));

  const passes = spec.passes[depth];
  const votes = spec.votes[depth];
  const found = capped ? [] : (await Promise.all(passes.map(async (p) => parseFindings(await run(finderPrompt(kind, p, range, full, branch, known)), p)))).flat();
  let next = known.reduce((m, f) => Math.max(m, Number(f.id.slice(1)) || 0), 0);
  const candidates: Finding[] = [];
  for (const f of found) if (![...known, ...candidates].some((k) => sameFinding(k, f))) candidates.push({ ...f, id: `${spec.idPrefix}${++next}` });
  const open = known.filter((f) => f.status === 'open');

  const ballots = candidates.length || open.length ? (await Promise.all(Array.from({ length: votes }, () => run(verifierPrompt(full, candidates, open))))).map(parseVotes).filter((b): b is Vote[] => !!b) : [];
  const kept = candidates.flatMap((f) => {
    const t = tally(ballots, f.id, 'keep');
    return t.pass ? [{ ...f, severity: t.severity ?? f.severity, status: 'open' as const, round }] : [];
  });
  const fixed: StoredFinding[] = [];
  const carried = known.map((f) => {
    if (f.status !== 'open') return f;
    const t = tally(ballots, f.id, 'fixed');
    if (t.pass && ballots.some((b) => b.some((v) => v.id === f.id))) {
      const g = { ...f, status: 'fixed' as const };
      fixed.push(g);
      return g;
    }
    return f;
  });
  const state: ReviewState = { round, sha: head, findings: [...carried, ...kept] };

  const inDiff = changedLines(git(c.root, ['diff', '-U0', '--no-color', full]) ?? '');
  const inline = kept.filter((f) => f.severity !== 'pre_existing' && inDiff.get(f.file)?.has(f.line));
  const outside = kept.filter((f) => !inline.includes(f));
  const nitIds = new Set(inline.filter((f) => f.severity === 'nit').slice(MAX_NITS).map((f) => f.id));
  const body = renderReview(state, { kind, depth, tier: risk.tier, since, capped, maxRounds, fixed, dropped: candidates.length - kept.length, outside });

  const prefix = kind === 'review' ? 'review' : 'security';
  writeFileSync(join(c.root, `${prefix}.json`), JSON.stringify({ ...state, depth, tier: risk.tier }, null, 2) + '\n');
  writeFileSync(join(c.root, `${prefix}-tally.txt`), counts(state.findings) + '\n');
  if (c.dryRun) {
    console.log(body);
    return 0;
  }
  const comments = inline
    .filter((f) => !nitIds.has(f.id))
    .map((f) => ({
      path: f.file,
      line: f.line,
      body: `**${LABEL[f.severity]}**${kind === 'security' ? ' · security' : ''} · ${f.bug_class} · ${f.id}\n\n${f.title}${f.evidence ? `\n\n${f.evidence}` : ''}\n\n<!-- sdlc:finding id=${f.id} -->`,
    }));
  if (comments.length) {
    const r = await prInlineComments(ctx, n, head, comments);
    log(`${r.posted} inline comment${r.posted === 1 ? '' : 's'} posted`);
    for (const f of r.failed) log(`inline comment skipped: ${f}`);
  }
  log(await prUpsertComment(ctx, n, spec.marker, body, ours));
  await reviewStatus(c, thread, { [kind]: state });
  if (kind === 'review') log(await notify({ event: 'review.done', change: findChange(c.root, c.loaded, { branch, active: false }), note: counts(state.findings) }, c.loaded, c.env));
  return 0;
}

/** Description of `sdlc/review` for the findings that block (or why it is pending). */
export function reviewVerdict(states: Partial<Record<ReviewKind, ReviewState>>, res: Map<string, Resolution>, head: string): { state: 'success' | 'failure' | 'pending'; description: string } {
  if (!states.review && !states.security) return { state: 'pending', description: 'the automated review has not run yet' };
  const stale = (Object.keys(states) as ReviewKind[]).filter((k) => states[k] && states[k]!.sha !== head);
  const block = (Object.keys(states) as ReviewKind[]).flatMap((k) => blocking(k, applyResolutions(states[k]!.findings, res)).map((f) => ({ ...f, kind: k })));
  if (block.length) {
    const list = block.map((f) => `${f.id} ${f.kind === 'security' ? 'security' : 'Important'} ${f.file}:${f.line}`).join(', ');
    return { state: 'failure', description: `${block.length} open: ${list}. Fix, or reply resolved: <reason>` };
  }
  if (stale.length) return { state: 'pending', description: `waiting for the ${stale.join(' and ')} of ${head.slice(0, 7)}` };
  const resolved = (Object.keys(states) as ReviewKind[]).flatMap((k) => states[k]!.findings.filter((f) => f.status === 'open' && res.has(f.id)));
  return { state: 'success', description: `no open Important or security findings${resolved.length ? ` (${resolved.length} resolved with a reason)` : ''}` };
}

/** `sdlc ci review-status`: recompute `sdlc/review` from the PR's review states and the resolution replies. */
export async function reviewStatus(c: CiEnv, thread?: ThreadComment[], fresh: Partial<Record<ReviewKind, ReviewState>> = {}): Promise<number> {
  const n = prNumber(c.env);
  if (n === undefined) throw new SdlcError('sdlc ci review-status needs PR_NUMBER (or CI_MERGE_REQUEST_IID, BITBUCKET_PR_ID)');
  const ctx = { root: c.root, loaded: c.loaded, env: c.env };
  thread ??= await prThread(ctx, n);
  const head = headSha(c);
  const states: Partial<Record<ReviewKind, ReviewState>> = {};
  for (const k of ['review', 'security'] as const) {
    const s = fresh[k] ?? stateFrom(thread, k);
    if (s) states[k] = s;
  }
  const v = reviewVerdict(states, resolutions(thread, c.loaded), head);
  if (c.dryRun) {
    console.log(`${REVIEW_STATUS}: ${v.state} — ${v.description}`);
    return 0;
  }
  log(await commitStatus(ctx, head, { state: v.state, context: REVIEW_STATUS, description: v.description }));
  return 0;
}
