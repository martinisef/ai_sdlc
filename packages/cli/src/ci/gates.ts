// Gates from the PR: `/approve spec` in a comment is the same decision as `sdlc approve` on a laptop,
// recorded as a commit on the change branch; `sdlc/gates` is the commit status branch protection requires.
import { execFileSync } from 'node:child_process';
import {
  artifactGate,
  ARTIFACTS,
  checkPrBody,
  codeGate,
  commitStatus,
  commitStatuses,
  decideGate,
  git,
  isAgent,
  isApproved,
  isGraded,
  isQuick,
  listChanges,
  localeOf,
  notify,
  prApprovals,
  prBody,
  prComment,
  requiredPrSections,
  SdlcError,
  type Approver,
  type Artifact,
  type Change,
  type CodeGate,
  type LoadedConfig,
  type RiskTier,
  type StatusState,
} from '@ai-native-sdlc/core';
import { headRef, prNumber, type CiEnv } from './index.ts';
import { prRisk } from './risk.ts';

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
export function gateState(
  change: Change | undefined,
  opts: { loaded?: LoadedConfig; tier?: RiskTier; code?: CodeGate } = {},
): { state: StatusState; description: string } {
  if (!change) return { state: 'success', description: 'no change folder on this branch: not gated' };
  if (change.stage === 'rejected') return { state: 'failure', description: `${change.slug}: rejected` };
  if (!isGraded(opts.loaded) || !opts.tier) {
    if (isQuick(change)) return { state: 'success', description: `${change.slug}: quick lane (limits checked on push)` };
    if (isApproved(change.artifacts.plan?.status)) return { state: 'success', description: `${change.slug}: intent, spec and plan approved` };
    const pending = ARTIFACTS.find((a) => !isApproved(change.artifacts[a]?.status)) ?? 'plan';
    const missing = !change.artifacts[pending];
    return { state: 'pending', description: `${change.slug}: ${pending} ${missing ? 'not written yet' : 'waiting for approval'} (/approve ${pending})` };
  }
  const tier = opts.tier;
  for (const a of isQuick(change) ? (['intent'] as const) : ARTIFACTS) {
    const g = artifactGate(change, a, opts.loaded, tier);
    if (g.ok) continue;
    if (!change.artifacts[a]) return { state: 'pending', description: `${change.slug}: ${a} not written yet` };
    if (g.stale) return { state: 'pending', description: `${change.slug}: ${tier} risk now needs ${g.need} approvals of the ${a}, it has ${g.have} (/approve ${a})` };
    return { state: 'pending', description: `${change.slug}: ${a} waiting for approval, ${g.have}/${g.need} at ${tier} risk (/approve ${a})` };
  }
  const code = opts.code;
  if (code && !code.ok) {
    const more = Math.max(code.need - code.have, 1);
    const why = code.stale.length ? `; new commits invalidated ${code.stale.map((x) => `@${x}`).join(', ')}` : '';
    return { state: 'pending', description: `${change.slug}: code needs ${more} more approval${more > 1 ? 's' : ''} at ${tier} risk (${code.have}/${code.need}${why})` };
  }
  const who = code ? `; code ${code.have}/${code.need}${code.directorCounts ? `, ${code.director} counts as reviewer` : ''}` : '';
  return { state: 'success', description: `${change.slug}: gates hold at ${tier} risk${who}` };
}

/** Who directed the change: the PR author when it is a person, otherwise the intent's author. */
export function directorOf(c: CiEnv, change: Change): Approver | undefined {
  const login = c.env.PR_AUTHOR;
  if (login && !isAgent({ login })) return { login };
  return change.author ? { name: change.author } : undefined;
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
  if (c.env.PR_ACTION === 'submitted' || c.env.PR_ACTION === 'dismissed' || c.env.PR_ACTION === 'edited') return false;
  const before = c.env.BEFORE_SHA && !/^0+$/.test(c.env.BEFORE_SHA) ? c.env.BEFORE_SHA : 'HEAD~1';
  return (git(c.root, ['diff', '--name-only', before, 'HEAD']) ?? '').split('\n').includes(path);
}

/** Why the PR description is not ready (ci.pr_sections), if it is not. PR_BODY wins over asking the forge. */
async function descriptionProblem(c: CiEnv, change: Change | undefined, n: number, tier?: RiskTier): Promise<string | undefined> {
  const required = requiredPrSections(c.loaded);
  if (!required.length) return undefined;
  let body = c.env.PR_BODY ?? (c.env.CI_MERGE_REQUEST_DESCRIPTION_IS_TRUNCATED === 'true' ? undefined : c.env.CI_MERGE_REQUEST_DESCRIPTION);
  if (body === undefined) {
    if (c.dryRun) return undefined;
    try {
      body = await prBody({ root: c.root, loaded: c.loaded, env: c.env }, n);
    } catch (e) {
      log(`could not read the PR description: ${(e as Error).message}`);
      return undefined;
    }
  }
  tier ??= (await prRisk(c, change, n)).tier;
  return checkPrBody(body, required, tier).problem;
}

/** Sets `sdlc/gates`; announces gate.pending when the waiting artifact is new in this push (or `announce`). */
export async function gateStatus(c: CiEnv, announce = false): Promise<number> {
  const branch = headRef(c);
  const change = changeForBranch(c, branch);
  const sha = c.env.HEAD_SHA || git(c.root, ['rev-parse', 'HEAD']);
  if (!sha) throw new SdlcError('no HEAD_SHA and no git HEAD');
  const n = prNumber(c.env);
  let opts: Parameters<typeof gateState>[1] = {};
  if (change && isGraded(c.loaded)) {
    const tier = (await prRisk(c, change, n)).tier;
    let approvals: { login: string; sha?: string }[] = [];
    if (n !== undefined && !c.dryRun) approvals = await prApprovals({ root: c.root, loaded: c.loaded, env: c.env }, n);
    opts = { loaded: c.loaded, tier, code: codeGate(c.root, c.loaded, { tier, head: sha, approvals, director: directorOf(c, change) }) };
  }
  let g = gateState(change, opts);
  if (g.state === 'success' && n !== undefined) {
    const problem = await descriptionProblem(c, change, n, opts.tier);
    if (problem) g = { state: 'failure', description: problem };
  }
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
    const tier = isGraded(c.loaded) ? (await prRisk(c, change, n)).tier : undefined;
    result = decideGate(c.root, c.loaded, change.id, cmd.artifact, cmd.decision, { approver, comment: cmd.comment, tier });
  } catch (e) {
    await reply(c, n, `Not recorded: ${(e as Error).message}.`);
    return 0;
  }
  if (!c.dryRun) execFileSync('git', ['push', 'origin', `HEAD:${branch}`], { cwd: c.root, stdio: ['ignore', 'inherit', 'inherit'] });
  const verb = cmd.decision === 'approved' ? 'approved' : 'rejected';
  const partial = result.approvals && result.approvals.have < result.approvals.need ? ` (${result.approvals.have} of ${result.approvals.need} approvals; still waiting)` : '';
  await reply(c, n, `**${cmd.artifact}** of \`${change.slug}\` ${verb} by @${login} (${result.commit})${partial}.${cmd.comment ? `\n\n> ${cmd.comment}` : ''}`);
  const decided = changeForBranch(c, branch) ?? change;
  if (!c.dryRun) log(await notify({ event: 'gate.decided', change: decided, artifact: cmd.artifact, decision: cmd.decision, by: `@${login}`, note: cmd.comment }, c.loaded, c.env));
  return gateStatus({ ...c, env: { ...c.env, HEAD_SHA: '' } }, cmd.decision === 'approved');
}

/** Contexts a merge-queue commit needs, carried from the PRs in the group once they passed there. */
export const QUEUE_CONTEXTS = [GATES_CONTEXT, 'sdlc/review'];

/**
 * `sdlc ci merge-queue` (GitHub `merge_group`): the queue builds a new commit, and required commit statuses must be
 * on it. Each PR in the group (from MERGE_GROUP_REF, gh-readonly-queue/<base>/pr-<n>-<sha>) must already have them
 * green on its head commit; then they are set on the queue commit (HEAD_SHA).
 */
export async function mergeQueue(c: CiEnv): Promise<number> {
  const sha = c.env.HEAD_SHA;
  const ref = c.env.MERGE_GROUP_REF ?? '';
  const prs = [...ref.matchAll(/pr-(\d+)-([0-9a-f]{40})/g)].map((m) => ({ n: m[1], sha: m[2] }));
  if (!sha || !prs.length) throw new SdlcError('sdlc ci merge-queue needs HEAD_SHA and MERGE_GROUP_REF (gh-readonly-queue/<base>/pr-<n>-<sha>)');
  const ctx = { root: c.root, loaded: c.loaded, env: c.env };
  for (const context of QUEUE_CONTEXTS) {
    const failing = c.dryRun ? [] : prs.filter((p) => commitStatuses(ctx, p.sha).some((s) => s.context === context && s.state !== 'success'));
    const s = failing.length
      ? { state: 'failure' as const, description: `not green on #${failing.map((p) => p.n).join(', #')}` }
      : { state: 'success' as const, description: `green on #${prs.map((p) => p.n).join(', #')} before the merge queue` };
    if (c.dryRun) console.log(`${context}: ${s.state} — ${s.description}`);
    else log(await commitStatus(ctx, sha, { context, ...s }));
  }
  return 0;
}
