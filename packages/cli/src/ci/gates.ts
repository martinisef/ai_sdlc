// Gates from the PR: `/approve spec` in a comment is the same decision as `sdlc approve` on a laptop,
// recorded as a commit on the change branch; `sdlc/gates` is the commit status branch protection requires.
import { execFileSync } from 'node:child_process';
import {
  ARTIFACTS,
  commitStatus,
  decideGate,
  git,
  isApproved,
  isQuick,
  listChanges,
  localeOf,
  notify,
  prComment,
  SdlcError,
  type Approver,
  type Artifact,
  type Change,
  type StatusState,
} from '@ai-native-sdlc/core';
import { headRef, prNumber, type CiEnv } from './index.ts';

export const GATE_COMMAND = /^\/(approve|reject) (intent|spec|plan)(?:[ \t]+(.*))?$/m;
export const GATES_CONTEXT = 'sdlc/gates';
export const GATE_HEADER = '## Gate (ai-sdlc)';
/** GitHub `author_association` values allowed to decide gates; GitLab/Bitbucket are filtered by the webhook. */
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export interface GateCommand {
  decision: 'approved' | 'rejected';
  artifact: Artifact;
  comment?: string;
}

export function parseGateCommand(body: string): GateCommand | undefined {
  const m = GATE_COMMAND.exec(body.replace(/\r/g, ''));
  if (!m) return undefined;
  return { decision: m[1] === 'approve' ? 'approved' : 'rejected', artifact: m[2] as Artifact, comment: m[3]?.trim() || undefined };
}

const log = (msg: string) => process.stderr.write(`[sdlc-ci] ${msg}\n`);

export function changeForBranch(c: Pick<CiEnv, 'root' | 'loaded'>, branch: string): Change | undefined {
  const slug = branch.replace(/^change\//, '');
  return listChanges(c.root, { locale: localeOf(c.loaded), defaultBranch: c.loaded?.config.vcs?.default_branch }).find(
    (x) => x.branch === branch || x.slug === slug || x.dir === slug,
  );
}

/** What `sdlc/gates` reports for a change: success once code may merge. */
export function gateState(change: Change | undefined): { state: StatusState; description: string } {
  if (!change) return { state: 'success', description: 'no change folder on this branch: not gated' };
  if (change.stage === 'rejected') return { state: 'failure', description: `${change.slug}: rejected` };
  if (isQuick(change)) return { state: 'success', description: `${change.slug}: quick lane (limits checked on push)` };
  if (isApproved(change.artifacts.plan?.status)) return { state: 'success', description: `${change.slug}: intent, spec and plan approved` };
  const pending = ARTIFACTS.find((a) => !isApproved(change.artifacts[a]?.status)) ?? 'plan';
  const missing = !change.artifacts[pending];
  return { state: 'pending', description: `${change.slug}: ${pending} ${missing ? 'not written yet' : 'waiting for approval'} (/approve ${pending})` };
}

async function reply(c: CiEnv, n: number, body: string) {
  if (c.dryRun) return void console.log(body);
  log(await prComment({ root: c.root, loaded: c.loaded, env: c.env }, n, `${GATE_HEADER}\n\n${body}`));
}

/** The artifact a pending gate waits on, if it is written: that is what people are asked to decide. */
function waitingArtifact(change: Change | undefined): Artifact | undefined {
  if (!change || change.stage === 'rejected' || isQuick(change)) return undefined;
  const a = ARTIFACTS.find((x) => !isApproved(change.artifacts[x]?.status));
  return a && change.artifacts[a] ? a : undefined;
}

/** Did this push touch `path`? PR_ACTION=opened|reopened counts as new for everything on the branch. */
function touched(c: CiEnv, path: string): boolean {
  if (c.env.PR_ACTION === 'opened' || c.env.PR_ACTION === 'reopened') return true;
  const before = c.env.BEFORE_SHA && !/^0+$/.test(c.env.BEFORE_SHA) ? c.env.BEFORE_SHA : 'HEAD~1';
  return (git(c.root, ['diff', '--name-only', before, 'HEAD']) ?? '').split('\n').includes(path);
}

/** Sets `sdlc/gates`; announces gate.pending when the waiting artifact is new in this push (or `announce`). */
export async function gateStatus(c: CiEnv, announce = false): Promise<number> {
  const branch = headRef(c);
  const change = changeForBranch(c, branch);
  const g = gateState(change);
  const sha = c.env.HEAD_SHA || git(c.root, ['rev-parse', 'HEAD']);
  if (!sha) throw new SdlcError('no HEAD_SHA and no git HEAD');
  const waiting = waitingArtifact(change);
  const pending = waiting && (announce || touched(c, change!.artifacts[waiting]!.path));
  if (c.dryRun) {
    console.log(`${GATES_CONTEXT}: ${g.state} — ${g.description}`);
    if (pending) console.log(`notify gate.pending: ${change!.slug}/${waiting}`);
    return 0;
  }
  log(await commitStatus({ root: c.root, loaded: c.loaded, env: c.env }, sha, { context: GATES_CONTEXT, ...g }));
  if (pending) log(await notify({ event: 'gate.pending', change, artifact: waiting }, c.loaded, c.env));
  return 0;
}

export async function gate(c: CiEnv): Promise<number> {
  const n = prNumber(c.env);
  const body = c.env.COMMENT_BODY ?? c.env.SDLC_MENTION_BODY ?? '';
  const login = c.env.COMMENT_AUTHOR ?? c.env.SDLC_MENTION_AUTHOR ?? '';
  const cmd = parseGateCommand(body);
  if (n === undefined || !cmd) {
    log('no /approve or /reject command in the comment');
    return 0;
  }
  const association = c.env.AUTHOR_ASSOCIATION;
  if (association !== undefined && !TRUSTED.has(association)) {
    await reply(c, n, `@${login} cannot decide gates here (${association.toLowerCase()}): only owners, members and collaborators can.`);
    return 0;
  }
  const branch = headRef(c);
  const change = changeForBranch(c, branch);
  if (!change) {
    await reply(c, n, `No change folder for branch \`${branch}\`: nothing to ${cmd.decision === 'approved' ? 'approve' : 'reject'}.`);
    return 0;
  }
  const prAuthor = c.env.PR_AUTHOR;
  if (cmd.artifact !== 'intent' && prAuthor && prAuthor.toLowerCase() === login.toLowerCase() && !c.loaded?.config.gates_self_approval) {
    await reply(c, n, `@${login} opened this PR, so another person must decide the ${cmd.artifact}.`);
    return 0;
  }
  const approver: Approver = { login, name: c.env.COMMENT_AUTHOR_NAME || login };
  const authorEnv = {
    GIT_AUTHOR_NAME: approver.name!,
    GIT_AUTHOR_EMAIL: c.env.COMMENT_AUTHOR_EMAIL || `${login}@users.noreply.${c.env.CI_SERVER_HOST ?? 'github.com'}`,
  };
  Object.assign(process.env, authorEnv);
  let result;
  try {
    result = decideGate(c.root, c.loaded, change.id, cmd.artifact, cmd.decision, { approver, comment: cmd.comment });
  } catch (e) {
    await reply(c, n, `Not recorded: ${(e as Error).message}.`);
    return 0;
  }
  if (!c.dryRun) execFileSync('git', ['push', 'origin', `HEAD:${branch}`], { cwd: c.root, stdio: ['ignore', 'inherit', 'inherit'] });
  const verb = cmd.decision === 'approved' ? 'approved' : 'rejected';
  await reply(c, n, `**${cmd.artifact}** of \`${change.slug}\` ${verb} by @${login} (${result.commit}).${cmd.comment ? `\n\n> ${cmd.comment}` : ''}`);
  const decided = changeForBranch(c, branch) ?? change;
  if (!c.dryRun) log(await notify({ event: 'gate.decided', change: decided, artifact: cmd.artifact, decision: cmd.decision, by: `@${login}`, note: cmd.comment }, c.loaded, c.env));
  return gateStatus({ ...c, env: { ...c.env, HEAD_SHA: '' } }, cmd.decision === 'approved');
}
