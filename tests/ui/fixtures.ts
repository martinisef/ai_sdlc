import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { test as base, expect } from '@playwright/test';

const CLI = resolve(import.meta.dirname, '../../packages/cli/dist/sdlc.mjs');
// the dashboard's agent jobs run tests/ui/stub-agent/claude, never a real agent
const STUB_AGENT = resolve(import.meta.dirname, 'stub-agent');

export const CONFIG = {
  version: 1,
  locale: 'en',
  agents: ['claude'],
  gates: { intent: ['po'], spec: ['po'], plan: ['tech-lead'] },
  roles: { po: ['ana@example.com'], 'tech-lead': ['ana@example.com'] },
  protected_paths: ['migrations/**'],
};

const artifact = (status: string, title: string, body: string) => `---\nstatus: ${status}\nauthor: Bo Writer\n---\n# ${title}\n\n${body}\n`;

/** A repo with one change waiting on its spec gate and one with an approved plan on main (merged). */
function seed(): string {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-ui-'));
  const g = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Ana Product');
  g('config', 'user.email', 'ana@example.com');
  mkdirSync(join(root, '.sdlc'));
  writeFileSync(join(root, '.sdlc/config.json'), JSON.stringify(CONFIG, null, 2));
  const write = (dir: string, name: string, text: string) => {
    mkdirSync(join(root, 'changes', dir), { recursive: true });
    writeFileSync(join(root, 'changes', dir, `${name}.md`), text);
  };
  write('claims-export', 'intent', artifact('accepted', 'Claims export', 'Adjusters need a CSV of open claims.'));
  write('claims-export', 'spec', artifact('draft', 'Claims export', '## Acceptance criteria\n\n- **CSV** has one row per open claim.'));
  write('health-endpoint', 'intent', artifact('accepted', 'Health endpoint', 'Ops needs a health check.'));
  write('health-endpoint', 'spec', artifact('approved', 'Health endpoint', 'GET /health returns 200.'));
  write('health-endpoint', 'plan', artifact('approved', 'Health endpoint', '1. Add the route.'));
  g('add', '-A');
  g('commit', '-qm', 'seed changes');
  return root;
}

function start(root: string, home: string): Promise<{ url: string; proc: ChildProcess }> {
  const proc = spawn(process.execPath, [CLI, 'ui', '--port', '0', '--no-open'], {
    cwd: root,
    env: { ...process.env, XDG_CONFIG_HOME: home, SDLC_PROJECT_DIR: root, PATH: `${STUB_AGENT}${delimiter}${process.env.PATH}`, SDLC_CI_AGENT: 'claude' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((ok, fail) => {
    let out = '';
    const timer = setTimeout(() => fail(new Error(`sdlc ui did not start:\n${out}`)), 15_000);
    const read = (d: Buffer) => {
      out += d;
      const m = /sdlc dashboard: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out);
      if (m) {
        clearTimeout(timer);
        ok({ url: m[1], proc });
      }
    };
    proc.stdout!.on('data', read);
    proc.stderr!.on('data', read);
    proc.on('exit', (code) => fail(new Error(`sdlc ui exited with ${code}:\n${out}`)));
  });
}

export const test = base.extend<{ repo: string; dashboard: string; consoleErrors: string[] }>({
  repo: async ({}, use) => use(seed()),
  dashboard: async ({ repo }, use) => {
    const { url, proc } = await start(repo, mkdtempSync(join(tmpdir(), 'sdlc-ui-home-')));
    await use(url);
    proc.kill();
  },
  // every test fails on an uncaught page error or a console error
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // a 422 is how the server answers an invalid config; the browser logs it as a failed resource
      page.on('console', (m) => m.type() === 'error' && !/status of 422/.test(m.text()) && errors.push(m.text()));
      await use(errors);
      expect(errors, 'no console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
