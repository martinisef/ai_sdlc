// `sdlc ci risk`: the tier of the PR/MR. The deterministic classifier always runs; with risk.agent_escalation
// a second, agent classifier asks whether this change needs another person anyway. It can only raise the tier.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approvalsFor, changeRisk, escalationFrom, git, isGraded, parseEscalation, prThread, prUpsertComment, riskMarker, type Change, type ChangeRisk } from '@ai-native-sdlc/core';
import { READ_TOOLS, runAgent } from './agent.ts';
import { changeForBranch } from './gates.ts';
import { baseRef, headRef, prNumber, type CiEnv } from './index.ts';

export const RISK_HEADER = '## Risk (ai-sdlc)';
export const RISK_SUMMARY = '<!-- sdlc:risk-summary -->';

const log = (msg: string) => process.stderr.write(`[sdlc-ci] ${msg}\n`);

/** `origin/<base>` when it was fetched, else the local branch. */
export function baseCommit(root: string, base: string): string {
  return git(root, ['rev-parse', '--verify', '--quiet', `origin/${base}^{commit}`]) ? `origin/${base}` : base;
}

export function renderRisk(r: ChangeRisk, extra: string[] = []): string {
  const why = r.reasons.length ? r.reasons.map((x) => `- **${x.tier}**: ${x.reason}`) : ['- small change, no sensitive paths, no dependency changes'];
  return [RISK_HEADER, '', `**Tier: ${r.tier}** (${r.files} files, ${r.weight} weighted lines of code)`, ...extra, '', ...why, '', RISK_SUMMARY].join('\n');
}

export function escalationPrompt(base: string, branch: string, r: ChangeRisk): string {
  return `You are the second risk classifier for this PR/MR. A deterministic classifier set the tier to ${r.tier}${
    r.reasons.length ? ` because: ${r.reasons.map((x) => x.reason).join('; ')}` : ''
  }.
Read the diff (git diff ${base}...HEAD) and changes/<slug>/spec.md and plan.md for the branch ${branch}.
Question: does this particular change need another person even though its tier says it does not?
Escalate for: authentication or authorization, money or billing, data loss or irreversible migrations, public contracts,
concurrency, security boundaries, CI or release workflows, or an architecture pattern others will copy. Size alone is not a reason.
Do not modify any file. Answer in at most five lines, and end with exactly one line:
ESCALATE: none   or   ESCALATE: medium — <reason>   or   ESCALATE: high — <reason>`;
}

/** The tier of the change on this PR, with the escalation the PR already carries. */
export async function prRisk(c: CiEnv, change: Change | undefined, n: number | undefined): Promise<ChangeRisk> {
  const base = baseCommit(c.root, baseRef(c));
  let esc: { tier?: ChangeRisk['tier']; reason?: string } = {};
  if (n !== undefined && !c.dryRun) {
    try {
      esc = escalationFrom((await prThread({ root: c.root, loaded: c.loaded, env: c.env }, n)).map((x) => x.body));
    } catch (e) {
      log(`could not read the PR comments: ${(e as Error).message}`);
    }
  }
  return changeRisk(c.root, c.loaded, change, { base, escalated: esc.tier, escalatedReason: esc.reason && `second classifier: ${esc.reason}` });
}

export async function risk(c: CiEnv, escalate: boolean): Promise<number> {
  const n = prNumber(c.env);
  const baseName = baseRef(c);
  git(c.root, ['fetch', '-q', 'origin', baseName]);
  const base = baseCommit(c.root, baseName);
  const change = changeForBranch(c, headRef(c));
  let r = changeRisk(c.root, c.loaded, change, { base });
  let marker = '';
  if ((escalate || c.loaded?.config.risk?.agent_escalation) && r.tier !== 'high') {
    const out = runAgent(c.agent, { mode: 'read', cwd: c.root, allowedTools: READ_TOOLS, prompt: escalationPrompt(base, headRef(c), r) }, c.model);
    const e = parseEscalation(out);
    r = changeRisk(c.root, c.loaded, change, { base, escalated: e.tier, escalatedReason: e.reason && `second classifier: ${e.reason}` });
    if (r.escalated && r.tier === r.escalated) marker = riskMarker(r.escalated, e.reason ?? '');
  }
  writeFileSync(join(c.root, 'risk.json'), JSON.stringify(r, null, 2) + '\n');
  const need = approvalsFor(c.loaded, r.tier);
  const extra = isGraded(c.loaded) ? [`Human approvals for the code: ${need === 0 ? 'none once the automated checks are green' : need} (risk.profile graded)`] : [];
  const body = renderRisk(r, extra) + (marker ? `\n${marker}` : '');
  if (n === undefined || c.dryRun) console.log(body);
  else log(await prUpsertComment({ root: c.root, loaded: c.loaded, env: c.env }, n, RISK_SUMMARY, body));
  return 0;
}
