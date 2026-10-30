// Human gates: approving or rejecting an artifact is a commit, so the decision lives in the audit trail.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getChange, type Change } from './changes.ts';
import { localeOf, type Artifact, type LoadedConfig } from './config.ts';
import { recordEvent } from './events.ts';
import { setFrontmatter } from './frontmatter.ts';
import { commitFiles, git, gitOrThrow, gitUser, lines } from './git.ts';

export interface Approver {
  name?: string;
  email?: string;
}

export interface GateResult {
  change: string;
  artifact: Artifact;
  decision: 'approved' | 'rejected';
  commit: string;
  by: string;
}

/** Agents and bots cannot approve: separation of duties. */
const AGENT_IDENTITY = /(\[bot\]|\bbot\b|claude|anthropic|cursor|codex|copilot|noreply@github)/i;

export function canApprove(change: Change, artifact: Artifact, who: Approver, loaded: LoadedConfig | undefined): { ok: boolean; reason?: string } {
  const id = `${who.name ?? ''} <${who.email ?? ''}>`;
  if (!who.email && !who.name) return { ok: false, reason: 'git user.name / user.email is not set' };
  if (AGENT_IDENTITY.test(id)) return { ok: false, reason: `${id} looks like an agent or bot; a person must approve` };
  const info = change.artifacts[artifact];
  if (!info) return { ok: false, reason: `${change.id}/${artifact}.md does not exist` };
  const author = info.data.author;
  if (author && who.name && author.toLowerCase().startsWith(who.name.toLowerCase()) && artifact !== 'intent') {
    return { ok: false, reason: `${who.name} authored ${artifact}.md; another person must approve it` };
  }
  const roles = loaded?.config.gates?.[artifact] ?? [];
  let required = roles;
  if (artifact === 'plan' && change.risk === 'high' && !required.includes('tech-lead')) required = [...required, 'tech-lead'];
  if (required.length === 0) return { ok: true };
  const members = required.flatMap((r) => loaded?.config.roles?.[r] ?? []);
  if (members.length === 0) return { ok: true }; // roles declared but nobody assigned: do not lock the team out
  const match = members.some((m) => m.toLowerCase() === who.email?.toLowerCase() || m.toLowerCase() === who.name?.toLowerCase());
  return match ? { ok: true } : { ok: false, reason: `${artifact} needs approval from: ${required.join(', ')}` };
}

export function decideGate(
  root: string,
  loaded: LoadedConfig | undefined,
  changeId: string,
  artifact: Artifact,
  decision: 'approved' | 'rejected',
  opts: { approver?: Approver; comment?: string } = {},
): GateResult {
  const locale = localeOf(loaded);
  const change = getChange(root, changeId, { locale, defaultBranch: loaded?.config.vcs?.default_branch });
  if (!change) throw new Error(`change not found: ${changeId}`);
  const who = opts.approver ?? gitUser(root);
  const check = canApprove(change, artifact, who, loaded);
  if (!check.ok) throw new Error(check.reason);
  const info = change.artifacts[artifact]!;
  // intents are "accepted" in the playbook vocabulary; spec and plan are "approved"
  const status = decision === 'rejected' ? 'rejected' : artifact === 'intent' ? 'accepted' : 'approved';
  const by = who.name ?? who.email!;
  const fields: Record<string, string> = { status };
  if (decision === 'approved') {
    fields.approved_by = by;
    fields.approved_at = new Date().toISOString().slice(0, 10);
  }
  const verb = decision === 'approved' ? 'approve' : 'reject';
  const msg = [`chore(${change.slug}): ${verb} ${artifact}`, '', opts.comment ?? '', `Gate: ${artifact} ${status} by ${by}${who.email ? ` <${who.email}>` : ''}`]
    .filter((l, i) => i !== 2 || l)
    .join('\n');
  const commit =
    change.source === 'worktree'
      ? commitInWorktree(root, info.path, fields, msg)
      : commitOnBranch(root, change.source.branch, info.path, fields, msg);
  recordEvent(root, { type: decision === 'approved' ? 'gate.approve' : 'gate.reject', change: change.id, artifact, by, detail: opts.comment });
  return { change: change.id, artifact, decision, commit, by };
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
