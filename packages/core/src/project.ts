import { isAbsolute, relative, resolve } from 'node:path';
import { git } from './git.ts';

/**
 * Project root, in order: explicit dir, the env var each agent sets for hooks,
 * the `cwd`/workspace root from the hook payload, the git toplevel, the process cwd.
 */
export function projectDir(opts: { explicit?: string; payloadCwd?: string } = {}): string {
  const candidate =
    opts.explicit ??
    process.env.SDLC_PROJECT_DIR ??
    process.env.CLAUDE_PROJECT_DIR ??
    process.env.CURSOR_PROJECT_DIR ??
    opts.payloadCwd;
  if (candidate) return resolve(candidate);
  return git(process.cwd(), ['rev-parse', '--show-toplevel']) ?? process.cwd();
}

/** Path relative to the project root; absolute paths outside it are returned unchanged. */
export function relPath(root: string, p: string): string {
  if (!isAbsolute(p)) return p.replace(/^\.\//, '');
  const rel = relative(root, p);
  return rel.startsWith('..') ? p : rel;
}
