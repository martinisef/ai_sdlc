// `sdlc metrics --prs`: the part of human time that only the forge knows (review rounds, comments by people),
// cached in .sdlc/pr-stats.json so `sdlc metrics`, the dashboard and the bands read it without network calls.
import { isAgent, listChanges, localeOf, prForBranch, prThread, writePrStats, type LoadedConfig, type PrStats, type ThreadComment } from '@ai-native-sdlc/core';
import { stateFrom } from './ci/review.ts';

/** Comments a person wrote: not an agent or bot, and not one of the loop's own sticky comments. */
export const humanComments = (thread: ThreadComment[]) => thread.filter((c) => !isAgent({ login: c.author }) && !c.body.includes('<!-- sdlc:')).length;

export const reviewRounds = (thread: ThreadComment[]) => Math.max(stateFrom(thread, 'review')?.round ?? 0, stateFrom(thread, 'security')?.round ?? 0);

export async function refreshPrStats(root: string, loaded: LoadedConfig | undefined): Promise<{ changes: Record<string, PrStats>; failed: string[] }> {
  const changes: Record<string, PrStats> = {};
  const failed: string[] = [];
  for (const c of listChanges(root, { locale: localeOf(loaded), defaultBranch: loaded?.config.vcs?.default_branch })) {
    if (!c.branch) continue;
    const pr = prForBranch(root, c.branch, loaded);
    if (!pr) continue;
    try {
      const thread = await prThread({ root, loaded }, pr.number);
      changes[c.id] = { pr: pr.number, rounds: reviewRounds(thread), humanComments: humanComments(thread) };
    } catch (e) {
      failed.push(`${c.id} (#${pr.number}): ${(e as Error).message}`);
    }
  }
  writePrStats(root, changes);
  return { changes, failed };
}
