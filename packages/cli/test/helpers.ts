import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const STUBS = join(REPO, 'tests/stubs');
const MAIN = join(REPO, 'packages/cli/src/main.ts');

for (const f of readdirSync(STUBS)) chmodSync(join(STUBS, f), 0o755);

/** A git repo on `branch` with one commit and a `.sdlc/config.json`. */
export function project(config: object, branch = 'main'): string {
  const root = join(mkdtempSync(join(tmpdir(), 'sdlc-cli-')), 'proj');
  mkdirSync(join(root, '.sdlc'), { recursive: true });
  writeFileSync(join(root, '.sdlc/config.json'), JSON.stringify({ version: 1, ...config }));
  const g = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  if (branch !== 'main') g('checkout', '-q', '-b', branch);
  return root;
}

export function commitAll(root: string, msg: string) {
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', msg], { cwd: root });
}

/** Run the CLI as a subprocess (async, so an in-process HTTP server can answer it). */
export function sdlc(root: string, args: string[], env: Record<string, string | undefined> = {}): Promise<{ code: number; out: string; err: string }> {
  const full: Record<string, string | undefined> = { PATH: `${STUBS}:${process.env.PATH}`, HOME: process.env.HOME, SDLC_PROJECT_DIR: root, ...env };
  for (const k of Object.keys(full)) if (full[k] === undefined) delete full[k];
  return new Promise((resolve) => {
    execFile(process.execPath, ['--conditions=source', MAIN, ...args], { cwd: root, env: full as NodeJS.ProcessEnv }, (e, out, err) =>
      resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out: out.trim(), err }),
    );
  });
}
