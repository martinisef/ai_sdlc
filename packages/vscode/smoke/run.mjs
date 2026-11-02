// Smoke test: a real VS Code (downloaded by @vscode/test-electron) loads the built extension on a sample project
// and the bundled CLI answers. CI runs it on Linux under xvfb: `xvfb-run -a node packages/vscode/smoke/run.mjs`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const here = dirname(fileURLToPath(import.meta.url));
const project = mkdtempSync(join(tmpdir(), 'sdlc-vscode-smoke-'));
const git = (...a) => execFileSync('git', a, { cwd: project, stdio: 'ignore' });
git('init', '-q', '-b', 'main');
git('config', 'user.name', 'Ana Product');
git('config', 'user.email', 'ana@example.com');
mkdirSync(join(project, '.sdlc'));
writeFileSync(join(project, '.sdlc/config.json'), JSON.stringify({ version: 1, locale: 'en', gates: {}, roles: {} }));
mkdirSync(join(project, 'changes/2026-11-export'), { recursive: true });
writeFileSync(join(project, 'changes/2026-11-export/intent.md'), '---\nstatus: accepted\nauthor: Bob\n---\n# Intent: export\n');
writeFileSync(join(project, 'changes/2026-11-export/spec.md'), '---\nstatus: draft\nauthor: Bob\n---\n# Spec: export\n');
git('add', '-A');
git('commit', '-qm', 'init');
git('checkout', '-q', '-b', 'change/export');

await runTests({
  extensionDevelopmentPath: resolve(here, '..'),
  extensionTestsPath: join(here, 'suite.cjs'),
  launchArgs: [project, '--disable-extensions', '--skip-welcome', '--skip-release-notes'],
});
console.log('vscode smoke: ok');
