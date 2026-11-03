// `sdlc ci capture-eval`: a reviewer miss becomes a reviewer eval. The commit that caused a revert or an incident is
// stored as a patch; the eval re-applies it on a fresh worktree and expects the review to flag it as Important.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { durationSeconds, git, isRevert, lines, SdlcError } from '@ai-native-sdlc/core';
import type { EvalCase } from './evals.ts';
import type { CiEnv } from './index.ts';

export const REVIEW_EVAL_PROMPT =
  'Review the last commit (git show HEAD) following REVIEW.md and print the findings table. Then end with exactly one line: IMPORTANT_FINDINGS: <number of Important findings>. Do not modify files.';
export const REVIEW_EVAL_TOOLS = 'Read,Grep,Glob,Bash(git show:*),Bash(git log:*),Bash(git diff:*)';
export const PATCH_DIR = 'evals/fixtures/review';

export type CaptureOrigin = 'revert' | 'incident';

const log = (msg: string) => process.stderr.write(`[sdlc-ci] ${msg}\n`);

/** Commits already captured, from the `source.commit` of every eval. */
function captured(root: string): Set<string> {
  const dir = join(root, 'evals');
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => {
        try {
          const c = (JSON.parse(readFileSync(join(dir, f), 'utf8')) as EvalCase).source?.commit;
          return c ? [c] : [];
        } catch {
          return [];
        }
      }),
  );
}

/**
 * The nearest directory above `file` (relative to the git top level, like the patch) with its own .sdlc/config.json:
 * the project an eval runs in, inside a monorepo; '' for the top level.
 */
function projectOf(top: string, file: string): string {
  const parts = file.split('/').slice(0, -1);
  for (let i = parts.length; i > 0; i--) if (existsSync(join(top, ...parts.slice(0, i), '.sdlc/config.json'))) return parts.slice(0, i).join('/');
  return '';
}

/** The reviewer eval for `sha`: its patch and a case that expects an Important finding in the files it touched. */
export function captureEval(root: string, sha: string, o: { origin: CaptureOrigin; expect?: string; name?: string }): { name: string; file: string } | undefined {
  const full = git(root, ['rev-parse', '--verify', '-q', `${sha}^{commit}`]);
  if (!full) throw new SdlcError(`unknown commit ${sha}`);
  if (captured(root).has(full)) return undefined;
  const patch = git(root, ['show', '--format=', '--binary', full]);
  const files = lines(git(root, ['show', '--format=', '--name-only', full])).filter((f) => !f.startsWith('changes/'));
  if (!patch || !files.length) throw new SdlcError(`${sha} changes no code`);
  const subject = git(root, ['log', '-1', '--format=%s', full]) ?? sha;
  const name = o.name ?? `review-${o.origin}-${full.slice(0, 8)}`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new SdlcError(`invalid eval name ${name} (letters, digits, dashes)`);
  mkdirSync(join(root, PATCH_DIR), { recursive: true });
  writeFileSync(join(root, PATCH_DIR, `${name}.patch`), patch + '\n');
  const top = git(root, ['rev-parse', '--show-toplevel']) ?? root;
  const projects = [...new Set(files.map((f) => projectOf(top, f)))];
  const main = files.find((f) => !/(^|\/)(test|tests|__tests__)\/|\.test\.|_test\./.test(f)) ?? files[0];
  const e: EvalCase & { name: string } = {
    name,
    ...(projects.length === 1 && projects[0] ? { cwd: projects[0] } : {}),
    description: `Reviewer miss (${o.origin}): ${subject}.${o.expect ? ` Expected finding: ${o.expect}` : ''}`,
    tags: ['review', `from-${o.origin}`],
    source: { commit: full, origin: o.origin, ...(o.expect ? { expect: o.expect } : {}) },
    setup: `cd "$EVAL_ROOT" && git apply "$EVAL_DIR/fixtures/review/${name}.patch" && "$EVAL_DIR/fixtures/commit.sh" ${JSON.stringify(subject.replace(/["$`\\]/g, ''))}`,
    prompt: REVIEW_EVAL_PROMPT,
    allowed_tools: REVIEW_EVAL_TOOLS,
    checks: [
      { type: 'output_matches', pattern: '^\\W*IMPORTANT_FINDINGS:\\W*[1-9]', why: 'the change was reverted or caused an incident' },
      { type: 'output_contains', text: main.split('/').pop()! },
      { type: 'diff_excludes', glob: '**', why: 'review is read-only' },
    ],
  };
  const file = `evals/${name}.json`;
  writeFileSync(join(root, file), JSON.stringify(e, null, 2) + '\n');
  return { name, file };
}

/** Culprits of the reverts on the default branch: the commit each one names in "This reverts commit <sha>". */
export function revertedCommits(root: string, branch: string, since?: Date): string[] {
  const range = ['--first-parent', ...(since ? [`--since=${since.toISOString()}`] : []), '--format=%s%x00%b%x1e'];
  const out = git(root, ['log', branch, ...range]) ?? git(root, ['log', 'HEAD', ...range]) ?? '';
  return out
    .split('\x1e')
    .map((r) => r.replace(/^\n/, '').split('\0'))
    .filter(([s, b]) => s && isRevert(s, b))
    .flatMap(([, b]) => /This reverts commit ([0-9a-f]{7,40})/.exec(b ?? '')?.[1] ?? []);
}

export function captureCommand(c: CiEnv, sha: string | undefined, flags: Record<string, string | true>): number {
  const expect = typeof flags.expect === 'string' ? flags.expect : undefined;
  const name = typeof flags.name === 'string' ? flags.name : undefined;
  if (flags.reverts) {
    const since = typeof flags.since === 'string' ? new Date(Date.now() - durationSeconds(flags.since) * 1000) : undefined;
    const shas = revertedCommits(c.root, c.loaded?.config.vcs?.default_branch ?? 'main', since);
    let n = 0;
    for (const s of shas) {
      try {
        const r = captureEval(c.root, s, { origin: 'revert' });
        if (r) {
          console.log(`wrote ${r.file}`);
          n++;
        }
      } catch (e) {
        log(`skipped ${s}: ${(e as Error).message}`);
      }
    }
    console.log(`${n} new reviewer eval(s) from ${shas.length} revert(s)`);
    return 0;
  }
  if (!sha) throw new SdlcError('usage: sdlc ci capture-eval <commit> [--origin incident|revert] [--expect "<finding>"] [--name N] | --reverts [--since 30d]');
  const origin = flags.origin === 'revert' ? 'revert' : 'incident';
  const r = captureEval(c.root, sha, { origin, expect, name });
  console.log(r ? `wrote ${r.file} and ${PATCH_DIR}/${r.name}.patch` : `${sha} is already captured`);
  return 0;
}
