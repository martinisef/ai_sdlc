// Human gates: approving or rejecting an artifact is a commit, so the decision lives in the audit trail.
// With risk.profile graded, how many people must approve scales with the change's risk tier.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getChange, type Change } from './changes.ts';
import { localeOf, type Artifact, type LoadedConfig } from './config.ts';
import { recordEvent } from './events.ts';
import { setFrontmatter } from './frontmatter.ts';
import { commitFiles, git, gitOrThrow, gitUser } from './git.ts';
import { changeRisk, type RiskTier } from './risk.ts';

export interface Approver {
  name?: string;
  email?: string;
  /** Forge username (GitHub/GitLab/Bitbucket), matched against `@login` entries in `roles`. */
  login?: string;
}

export interface GateResult {
  change: string;
  artifact: Artifact;
  decision: 'approved' | 'rejected';
  commit: string;
  by: string;
  /** Human approvals recorded so far and how many the tier needs. */
  approvals?: { have: number; need: number };
}

/** Agents and bots cannot approve: separation of duties. */
export const AGENT_IDENTITY = /(\[bot\]|\bbot\b|claude|anthropic|cursor|codex|copilot|noreply@github)/i;
export const isAgent = (who: Approver) => AGENT_IDENTITY.test(`${who.name ?? ''} <${who.email ?? ''}> ${who.login ?? ''}`);

/** Who approved when nobody had to: the tier's policy, recorded as such in `approved_by`. */
export const AUTO_APPROVER = 'sdlc';

export const TIER_APPROVALS: Record<'strict' | 'graded', Record<RiskTier, number>> = {
  strict: { low: 1, medium: 1, high: 1 },
  graded: { low: 0, medium: 1, high: 2 },
};

export const isGraded = (loaded: LoadedConfig | undefined) => loaded?.config.risk?.profile === 'graded';

/** Human approvals a tier needs. The intent always needs a person: deciding whether to build it is not delegated. */
export function approvalsFor(loaded: LoadedConfig | undefined, tier: RiskTier, artifact: Artifact | 'code' = 'code'): number {
  const profile = isGraded(loaded) ? 'graded' : 'strict';
  const n = loaded?.config.risk?.tiers?.[tier]?.approvals ?? TIER_APPROVALS[profile][tier];
  return artifact === 'intent' ? Math.max(1, n) : n;
}

/** `entry` from `roles` or `risk.trusted_authors` (`@login`, email or git name) matches `who`. */
export function personMatches(entries: string[], who: Approver): boolean {
  return entries.some((m) => {
    const x = m.toLowerCase();
    if (x.startsWith('@')) return !!who.login && x.slice(1) === who.login.toLowerCase();
    return x === who.email?.toLowerCase() || x === who.name?.toLowerCase();
  });
}

/** Authors who get the lighter paths. Unset: everyone in `roles`, or anyone when there are no roles. Agents never. */
export function isTrustedAuthor(loaded: LoadedConfig | undefined, who: Approver): boolean {
  if (isAgent(who) || (!who.name && !who.email && !who.login)) return false;
  const list = loaded?.config.risk?.trusted_authors ?? [...new Set(Object.values(loaded?.config.roles ?? {}).flat())];
  if (!loaded?.config.risk?.trusted_authors && !list.length) return true;
  return personMatches(list, who);
}

/** Roles that must decide `artifact` (high-risk plans add tech-lead) and the people holding them. */
export function requiredApprovers(change: Change, artifact: Artifact, loaded: LoadedConfig | undefined): { roles: string[]; people: string[] } {
  let roles = loaded?.config.gates?.[artifact] ?? [];
  if (artifact === 'plan' && change.risk === 'high' && !roles.includes('tech-lead')) roles = [...roles, 'tech-lead'];
  return { roles, people: [...new Set(roles.flatMap((r) => loaded?.config.roles?.[r] ?? []))] };
}

/** People in `approved_by` (comma-separated), without the automatic approval. */
export function humanApprovers(approvedBy: string | undefined): string[] {
  return (approvedBy ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith(AUTO_APPROVER + ' ') && s !== AUTO_APPROVER);
}

export function canApprove(change: Change, artifact: Artifact, who: Approver, loaded: LoadedConfig | undefined): { ok: boolean; reason?: string } {
  const id = `${who.name ?? ''} <${who.email ?? ''}>${who.login ? ` @${who.login}` : ''}`;
  if (!who.email && !who.name && !who.login) return { ok: false, reason: 'git user.name / user.email is not set' };
  if (isAgent(who)) return { ok: false, reason: `${id} looks like an agent or bot; a person must approve` };
  const info = change.artifacts[artifact];
  if (!info) return { ok: false, reason: `${change.id}/${artifact}.md does not exist` };
  const author = info.data.author;
  if (author && who.name && !loaded?.config.gates_self_approval && author.toLowerCase().startsWith(who.name.toLowerCase()) && artifact !== 'intent') {
    return { ok: false, reason: `${who.name} authored ${artifact}.md; another person must approve it` };
  }
  const by = who.name ?? who.email ?? `@${who.login}`;
  if (isGraded(loaded) && humanApprovers(info.data.approved_by).some((x) => x.toLowerCase() === by.toLowerCase()))
    return { ok: false, reason: `${by} already approved ${artifact}.md; another person must add the next approval` };
  const { roles: required, people: members } = requiredApprovers(change, artifact, loaded);
  if (required.length === 0) return { ok: true };
  if (members.length === 0) return { ok: true }; // roles declared but nobody assigned: do not lock the team out
  return personMatches(members, who) ? { ok: true } : { ok: false, reason: `${artifact} needs approval from: ${required.join(', ')}` };
}

/** Tier of a change for its gates: the declared risk, what the spec/plan name, and the diff against the default branch. */
export function gateTier(root: string, loaded: LoadedConfig | undefined, change: Change): RiskTier {
  const base = loaded?.config.vcs?.default_branch ?? 'main';
  return changeRisk(root, loaded, change, { base: change.branch && git(root, ['rev-parse', '--verify', '--quiet', change.branch]) ? base : undefined, head: change.branch }).tier;
}

export interface ArtifactGate {
  /** Human approvals the tier asks for and how many are recorded. */
  need: number;
  have: number;
  /** Status approved/accepted and enough people for the current tier. */
  ok: boolean;
  /** Approved while the tier was lower; it needs more people now. */
  stale?: boolean;
}

/**
 * Whether an artifact's gate holds at `tier`. In strict mode, the status decides (as always). In graded mode,
 * an approval recorded at a lower tier is not enough once the change grows: the gate opens again.
 */
export function artifactGate(change: Change, artifact: Artifact, loaded: LoadedConfig | undefined, tier: RiskTier): ArtifactGate {
  const info = change.artifacts[artifact];
  const approved = !!info && ['approved', 'accepted'].includes(info.status ?? '');
  if (!isGraded(loaded)) return { need: 1, have: approved ? 1 : 0, ok: approved };
  const need = approvalsFor(loaded, tier, artifact);
  const have = humanApprovers(info?.data.approved_by).length;
  return { need, have, ok: approved && have >= need, stale: approved && have < need };
}

export interface CodeGate {
  tier: RiskTier;
  need: number;
  have: number;
  ok: boolean;
  /** Approvals that count, and the ones a later commit invalidated. */
  counted: string[];
  stale: string[];
  /** The person directing the agent counts as one reviewer when they are a trusted author. */
  director?: string;
  directorCounts: boolean;
}

/**
 * Whether the commits after an approval keep it valid: each one is a clean merge, a gate commit, or authored by a
 * trusted person. An agent's push, a merge resolved by hand or a force-push means the approval has to be given again.
 */
export function vouched(root: string, loaded: LoadedConfig | undefined, from: string, to: string): boolean {
  if (git(root, ['merge-base', '--is-ancestor', from, to]) === undefined) return false;
  for (const sha of (git(root, ['rev-list', `${from}..${to}`]) ?? '').split('\n').filter(Boolean)) {
    const [name, email, parents, tree, body] = (git(root, ['log', '-1', '--format=%an%x00%ae%x00%P%x00%T%x00%B', sha]) ?? '').split('\0');
    const ps = parents?.split(' ').filter(Boolean) ?? [];
    if (ps.length > 1) {
      if (git(root, ['merge-tree', '--write-tree', ps[0], ps[1]]) !== tree) return false;
      continue;
    }
    const files = (git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]) ?? '').split('\n').filter(Boolean);
    if (/^Gate: /m.test(body ?? '') && files.every((f) => f.startsWith('changes/'))) continue;
    if (!isTrustedAuthor(loaded, { name, email })) return false;
  }
  return true;
}

/** Human approvals of the code on the PR at `head`, against what the tier asks for. Graded profile only. */
export function codeGate(
  root: string,
  loaded: LoadedConfig | undefined,
  o: { tier: RiskTier; head: string; approvals: { login: string; sha?: string }[]; director?: Approver },
): CodeGate {
  const directorTrusted = !!o.director && isTrustedAuthor(loaded, o.director);
  let need = approvalsFor(loaded, o.tier, 'code');
  if (!directorTrusted) need = Math.max(need, 1);
  const counted: string[] = [];
  const stale: string[] = [];
  for (const a of o.approvals) {
    if (!a.login || isAgent({ login: a.login }) || counted.includes(a.login) || a.login.toLowerCase() === o.director?.login?.toLowerCase()) continue;
    const current = !a.sha || o.head.startsWith(a.sha) || a.sha.startsWith(o.head) || vouched(root, loaded, a.sha, o.head);
    (current ? counted : stale).push(a.login);
  }
  const have = counted.length + (directorTrusted ? 1 : 0);
  // at high risk the director alone is never enough: someone else reads it
  const others = o.tier === 'high' && need > 0 ? 1 : 0;
  const director = o.director ? (o.director.login ? `@${o.director.login}` : o.director.name) : undefined;
  return { tier: o.tier, need, have, ok: have >= need && counted.length >= others, counted, stale, director, directorCounts: directorTrusted };
}

export function decideGate(
  root: string,
  loaded: LoadedConfig | undefined,
  changeId: string,
  artifact: Artifact,
  decision: 'approved' | 'rejected',
  opts: { approver?: Approver; comment?: string; auto?: boolean; tier?: RiskTier } = {},
): GateResult {
  const locale = localeOf(loaded);
  const change = getChange(root, changeId, { locale, defaultBranch: loaded?.config.vcs?.default_branch });
  if (!change) throw new Error(`change not found: ${changeId}`);
  const info = change.artifacts[artifact];
  const graded = isGraded(loaded);
  const tier = opts.tier ?? (graded ? gateTier(root, loaded, change) : 'low');
  const need = graded ? approvalsFor(loaded, tier, artifact) : 1;
  let who: Approver;
  let by: string;
  let approvers: string[] = [];
  if (opts.auto) {
    if (decision !== 'approved') throw new Error('only approvals can be automatic');
    if (!info) throw new Error(`${change.id}/${artifact}.md does not exist`);
    if (!graded) throw new Error(`risk.profile is strict: ${artifact} needs a person (sdlc approve ${change.slug} ${artifact})`);
    if (need > 0) throw new Error(`${artifact} needs ${need} human approval${need > 1 ? 's' : ''} at ${tier} risk`);
    const author = change.author ?? info.data.author;
    if (!author || !isTrustedAuthor(loaded, { name: author })) throw new Error(`${author ?? 'the author'} is not in risk.trusted_authors: another person must approve ${artifact}`);
    who = { name: `${AUTO_APPROVER} (risk ${tier})` };
    by = who.name!;
  } else {
    who = opts.approver ?? gitUser(root);
    const check = canApprove(change, artifact, who, loaded);
    if (!check.ok) throw new Error(check.reason);
    by = who.name ?? who.email ?? `@${who.login}`;
    if (graded && decision === 'approved') approvers = [...humanApprovers(info!.data.approved_by), by];
  }
  const enough = !graded || opts.auto || approvers.length >= need;
  // intents are "accepted" in the playbook vocabulary; spec and plan are "approved"
  const done = artifact === 'intent' ? 'accepted' : 'approved';
  const status = decision === 'rejected' ? 'rejected' : enough ? done : (info!.status ?? 'draft');
  const fields: Record<string, string> = { status };
  if (decision === 'approved') {
    fields.approved_by = graded && !opts.auto ? approvers.join(', ') : by;
    fields.approved_at = new Date().toISOString().slice(0, 10);
    const sha = git(root, ['rev-parse', '--short', change.source === 'worktree' ? 'HEAD' : change.source.branch]);
    if (sha) fields.approved_sha = sha;
    if (graded) fields.approved_tier = tier;
  } else if (graded && info?.data.approved_by) fields.approved_by = '';
  const verb = decision === 'approved' ? 'approve' : 'reject';
  const count = graded && decision === 'approved' && !opts.auto ? ` (${approvers.length}/${need}, ${tier} risk)` : '';
  const msg = [`chore(${change.slug}): ${verb} ${artifact}`, '', opts.comment ?? '', `Gate: ${artifact} ${enough || decision === 'rejected' ? status : 'approval'} by ${by}${who.email ? ` <${who.email}>` : ''}${count}`]
    .filter((l, i) => i !== 2 || l)
    .join('\n');
  const commit =
    change.source === 'worktree'
      ? commitInWorktree(root, info!.path, fields, msg)
      : commitOnBranch(root, change.source.branch, info!.path, fields, msg);
  recordEvent(root, { type: decision === 'approved' ? 'gate.approve' : 'gate.reject', change: change.id, artifact, by, detail: opts.comment ?? (opts.auto ? `automatic at ${tier} risk` : undefined) });
  return { change: change.id, artifact, decision, commit, by, ...(graded && decision === 'approved' ? { approvals: { have: opts.auto ? 0 : approvers.length, need } } : {}) };
}

function commitInWorktree(root: string, path: string, fields: Record<string, string>, msg: string): string {
  const full = join(root, path);
  writeFileSync(full, setFrontmatter(readFileSync(full, 'utf8'), fields));
  gitOrThrow(root, ['add', '--', path]);
  gitOrThrow(root, ['commit', '-m', msg, '--', path]);
  return gitOrThrow(root, ['rev-parse', '--short', 'HEAD']);
}

/**
 * Commits the gate decision on a change/* branch that is not checked out, without touching the
 * working tree (temporary index + commit-tree), so the dashboard can decide gates on any branch.
 */
function commitOnBranch(root: string, branch: string, path: string, fields: Record<string, string>, msg: string): string {
  const current = gitOrThrow(root, ['show', `refs/heads/${branch}:${path}`]);
  return commitFiles(root, branch, { [path]: setFrontmatter(current + '\n', fields) }, msg);
}
