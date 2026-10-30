// Small helpers shared by the VCS and tracker integrations: errors with exit codes, JSON over HTTP, CLI calls.
import { execFileSync } from 'node:child_process';

/** An expected failure, reported to the user without a stack trace. */
export class SdlcError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

export async function httpJson(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new SdlcError(`${method} ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new SdlcError(`${method} ${url}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`.trim());
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

export const basicAuth = (user: string, secret: string) => `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`;

/** Run a CLI (gh, glab, git …); throws SdlcError with its stderr. */
export function runTool(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  try {
    return execFileSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch (e) {
    const err = e as { code?: string; stderr?: string; message: string };
    if (err.code === 'ENOENT') throw new SdlcError(`${cmd} is not installed`);
    throw new SdlcError(`${cmd} ${args[0] ?? ''}: ${err.stderr?.trim() || err.message}`);
  }
}

export function hasTool(cmd: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    execFileSync(cmd, ['--version'], { env, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
