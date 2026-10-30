import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Throwaway git repo with a .sdlc/config.json and one commit. */
export function repo(config: object = { version: 1, locale: 'en' }): string {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-'));
  const g = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Ana Product');
  g('config', 'user.email', 'ana@example.com');
  mkdirSync(join(root, '.sdlc'));
  writeFileSync(join(root, '.sdlc/config.json'), JSON.stringify(config));
  g('add', '-A');
  g('commit', '-qm', 'init');
  return root;
}

export const gitIn = (root: string, ...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
