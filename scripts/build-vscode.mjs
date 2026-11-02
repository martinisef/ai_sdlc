// Builds the editor extension: dist/extension.js (esbuild) plus the CLI bundle in dist/cli, so it runs with nothing installed.
// --package also writes packages/vscode/ai-sdlc-<version>.vsix, versioned like @morsadev/sdlc.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = 'packages/vscode';
const out = `${dir}/dist`;
if (!existsSync('packages/cli/dist/sdlc.mjs')) throw new Error('packages/cli/dist/sdlc.mjs missing: run `npm run build:cli` first');
rmSync(out, { recursive: true, force: true });
await build({
  entryPoints: [`${dir}/src/extension.ts`],
  outfile: `${out}/extension.js`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  conditions: ['source'],
  external: ['vscode'],
  legalComments: 'none',
  logLevel: 'warning',
});
cpSync('packages/cli/dist', `${out}/cli`, { recursive: true });
writeFileSync(`${out}/package.json`, '{ "type": "commonjs" }\n');
console.log(`built ${out}/extension.js (+ bundled CLI)`);

if (process.argv.includes('--package')) {
  const { version } = JSON.parse(readFileSync('packages/cli/package.json', 'utf8'));
  const stage = resolve(dir, '.stage');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage);
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  delete pkg.private;
  delete pkg.type;
  delete pkg.scripts;
  delete pkg.devDependencies;
  writeFileSync(join(stage, 'package.json'), JSON.stringify({ ...pkg, version }, null, 2));
  for (const f of ['README.md', 'media']) cpSync(join(dir, f), join(stage, f), { recursive: true });
  cpSync('LICENSE', join(stage, 'LICENSE'));
  cpSync(out, join(stage, 'dist'), { recursive: true });
  const vsix = resolve(dir, `ai-sdlc-${version}.vsix`);
  const vsce = resolve('node_modules/@vscode/vsce/vsce');
  execFileSync(process.execPath, [vsce, 'package', '--no-dependencies', '--allow-missing-repository', '--out', vsix], { cwd: stage, stdio: 'inherit' });
  rmSync(stage, { recursive: true, force: true });
  console.log(`packaged ${vsix}`);
}
