// Which sdlc to run: a setting, the workspace's node_modules/.bin/sdlc, or the CLI bundled in the extension,
// run by the editor's own runtime (ELECTRON_RUN_AS_NODE=1) so nothing has to be installed.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface Cli {
  cmd: string;
  args: string[];
  env: Record<string, string>;
  label: string;
}

export function resolveCli(root: string, extensionDir: string, override = '', execPath = process.execPath, platform = process.platform): Cli {
  if (override) return { cmd: override, args: [], env: {}, label: override };
  const local = join(root, 'node_modules', '.bin', platform === 'win32' ? 'sdlc.cmd' : 'sdlc');
  if (existsSync(local)) return { cmd: local, args: [], env: {}, label: 'node_modules/.bin/sdlc' };
  return { cmd: execPath, args: [join(extensionDir, 'dist', 'cli', 'sdlc.mjs')], env: { ELECTRON_RUN_AS_NODE: '1' }, label: 'bundled CLI' };
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCli(cli: Cli, root: string, args: string[], timeout = 30_000): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      cli.cmd,
      [...cli.args, ...args],
      { cwd: root, env: { ...process.env, ...cli.env, SDLC_PROJECT_DIR: root }, timeout, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) || (err && code === 1 ? err.message : '') });
      },
    );
  });
}

/** The command as one line for an integrated terminal (the terminal gets `cli.env` separately). */
export function shellLine(cli: Cli, args: string[], platform = process.platform): string {
  const parts = [cli.cmd, ...cli.args, ...args];
  if (platform === 'win32') return `& ${parts.map((p) => `"${p.replace(/"/g, '`"')}"`).join(' ')}`;
  return parts.map((p) => (/^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`)).join(' ');
}
