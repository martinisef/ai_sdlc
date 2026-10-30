// Packs @morsadev/sdlc like `npm publish` would, checks the tarball and smoke-tests it in a fresh project:
// install from the tarball (no registry: the bundle has no runtime dependencies), `sdlc init`, `sdlc doctor`.
// Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'sdlc-pack-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const fail = (msg) => {
  console.error(`check-pack: ${msg}`);
  process.exitCode = 1;
};

try {
  const [info] = JSON.parse(run('npm', ['pack', '-w', '@morsadev/sdlc', '--json', '--pack-destination', tmp]));
  const files = info.files.map((f) => f.path);
  for (const f of ['dist/sdlc.mjs', 'dist/ui/index.html', 'dist/content/en/skills/sdlc-spec/SKILL.md', 'dist/content/es/skills/sdlc-spec/SKILL.md', 'LICENSE', 'package.json']) {
    if (!files.includes(f)) fail(`missing ${f}`);
  }
  for (const f of files) if (/^(src|test)\//.test(f)) fail(`unexpected ${f}`);
  const pkg = JSON.parse(readFileSync(new URL('../packages/cli/package.json', import.meta.url), 'utf8'));
  if (pkg.dependencies && Object.keys(pkg.dependencies).length) fail(`runtime dependencies must be bundled: ${Object.keys(pkg.dependencies)}`);
  const mb = info.unpackedSize / 1e6;
  if (mb > 10) fail(`unpacked size ${mb.toFixed(1)} MB > 10 MB`);
  console.log(`${info.filename}: ${files.length} files, ${(info.size / 1e6).toFixed(2)} MB packed, ${mb.toFixed(2)} MB unpacked`);

  const proj = join(tmp, 'proj');
  run('mkdir', ['-p', proj]);
  writeFileSync(join(proj, 'package.json'), JSON.stringify({ name: 'proj', private: true, scripts: { test: 'true' } }));
  run('git', ['init', '-q', '-b', 'main'], proj);
  run('npm', ['i', '-D', '--no-audit', '--no-fund', '--offline', join(tmp, info.filename)], proj);
  const sdlc = (...args) => run(join(proj, 'node_modules/.bin/sdlc'), args, proj);
  const version = sdlc('--version').trim();
  if (!version.includes(pkg.version)) fail(`sdlc --version printed "${version}", expected ${pkg.version}`);
  sdlc('init', '--yes');
  sdlc('doctor');
  console.log(`installed ${version}; init + doctor ok`);
} catch (err) {
  fail(`${err.message}\n${err.stdout ?? ''}${err.stderr ?? ''}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
