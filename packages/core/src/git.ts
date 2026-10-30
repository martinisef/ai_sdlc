import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Run git in `cwd`; returns trimmed stdout, or undefined when git fails. */
export function git(cwd: string, args: string[], input?: string): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    }).replace(/\n$/, '');
  } catch {
    return undefined;
  }
}

/** Like `git` but throws with git's stderr. For writes, where silent failure would lie to the user. */
export function gitOrThrow(cwd: string, args: string[], opts: { input?: string; env?: Record<string, string> } = {}): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      input: opts.input,
      env: opts.env ? { ...process.env, ...opts.env } : undefined,
      stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`git ${args.join(' ')}: ${err.stderr?.trim() || err.message}`);
  }
}

/**
 * Commit `files` (path → content) onto `branch` without touching the working tree or the real index
 * (temporary index + commit-tree). With `from`, the branch is created from that commit-ish and must not exist yet.
 * Returns the short sha.
 */
export function commitFiles(root: string, branch: string, files: Record<string, string>, msg: string, from?: string): string {
  const ref = `refs/heads/${branch}`;
  if (lines(git(root, ['worktree', 'list', '--porcelain'])).some((l) => l === `branch ${ref}`))
    throw new Error(`${branch} is checked out in a worktree; commit from there`);
  const parent = gitOrThrow(root, ['rev-parse', `${from ?? ref}^{commit}`]);
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-commit-'));
  try {
    const env = { GIT_INDEX_FILE: join(dir, 'index') };
    gitOrThrow(root, ['read-tree', parent], { env });
    for (const [path, content] of Object.entries(files)) {
      const blob = gitOrThrow(root, ['hash-object', '-w', '--stdin'], { input: content });
      gitOrThrow(root, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], { env });
    }
    const tree = gitOrThrow(root, ['write-tree'], { env });
    const sha = gitOrThrow(root, ['commit-tree', tree, '-p', parent], { input: msg + '\n' });
    // old value: the parent we built on, or "must not exist" when creating the branch
    gitOrThrow(root, ['update-ref', '-m', `sdlc: ${msg.split('\n')[0]}`, ref, sha, from ? '0'.repeat(sha.length) : parent]);
    return sha.slice(0, 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function lines(out: string | undefined): string[] {
  return out ? out.split('\n').filter(Boolean) : [];
}

export function currentBranch(cwd: string): string | undefined {
  return git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

export function gitUser(cwd: string): { name?: string; email?: string } {
  return { name: git(cwd, ['config', 'user.name']), email: git(cwd, ['config', 'user.email']) };
}
