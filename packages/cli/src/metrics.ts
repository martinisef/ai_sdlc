// `sdlc metrics --prs`: the part of human time that only the forge knows (review rounds, comments by people),
// cached in .sdlc/pr-stats.json so `sdlc metrics`, the dashboard and the bands read it without network calls.
import {
  isAgent,
  listChanges,
  localeOf,
  prForBranch,
  prThread,
  WRONG_REASON,
  writePrStats,
  type LoadedConfig,
  type Outcomes,
  type PrStats,
  type ThreadComment,
} from '@ai-native-sdlc/core';
import { resolutions, stateFrom } from './ci/review.ts';

/** Comments a person wrote: not an agent or bot, and not one of the loop's own sticky comments. */
export const humanComments = (thread: ThreadComment[]) => thread.filter((c) => !isAgent({ login: c.author }) && !c.body.includes('<!-- sdlc:')).length;

export const reviewRounds = (thread: ThreadComment[]) => Math.max(stateFrom(thread, 'review')?.round ?? 0, stateFrom(thread, 'security')?.round ?? 0);

/** Every finding of the automated review and security review on the PR, by what happened to it. */
export function commentOutcomes(thread: ThreadComment[], loaded: LoadedConfig | undefined, prState: string): Outcomes {
  const o: Outcomes = { fixed: 0, wrong: 0, intentional: 0, ignored: 0, open: 0 };
  const replies = resolutions(thread, loaded);
  const done = prState === 'merged' || prState === 'closed';
  for (const kind of ['review', 'security'] as const) {
    for (const f of stateFrom(thread, kind)?.findings ?? []) {
      const reason = f.status === 'resolved' ? f.reason : f.status === 'open' ? replies.get(f.id)?.reason : undefined;
      if (f.status === 'fixed') o.fixed++;
      else if (reason !== undefined) o[WRONG_REASON.test(reason.trim()) ? 'wrong' : 'intentional']++;
      else o[done ? 'ignored' : 'open']++;
    }
  }
  return o;
}

export async function refreshPrStats(root: string, loaded: LoadedConfig | undefined): Promise<{ changes: Record<string, PrStats>; failed: string[] }> {
  const changes: Record<string, PrStats> = {};
  const failed: string[] = [];
  for (const c of listChanges(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch })) {
    if (!c.branch) continue;
    const pr = prForBranch(root, c.branch, loaded);
    if (!pr) continue;
    try {
      const thread = await prThread({ root, loaded }, pr.number);
      changes[c.id] = { pr: pr.number, rounds: reviewRounds(thread), humanComments: humanComments(thread), outcomes: commentOutcomes(thread, loaded, pr.state) };
    } catch (e) {
      failed.push(`${c.id} (#${pr.number}): ${(e as Error).message}`);
    }
  }
  writePrStats(root, changes);
  return { changes, failed };
}
