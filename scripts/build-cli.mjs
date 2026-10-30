// Bundles the CLI (core + adapters + server) into one file and ships content/ and the built UI next to it.
import { build } from 'esbuild';
import { chmodSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs';

const out = 'packages/cli/dist';
const { version } = JSON.parse(readFileSync('packages/cli/package.json', 'utf8'));
rmSync(out, { recursive: true, force: true });
await build({
  entryPoints: ['packages/cli/src/main.ts'],
  outfile: `${out}/sdlc.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  conditions: ['source'],
  define: { __SDLC_VERSION__: JSON.stringify(version) },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});
chmodSync(`${out}/sdlc.mjs`, 0o755);
cpSync('content', `${out}/content`, { recursive: true });
cpSync('LICENSE', 'packages/cli/LICENSE');
if (existsSync('packages/ui/dist/index.html')) cpSync('packages/ui/dist', `${out}/ui`, { recursive: true });
else console.warn('packages/ui/dist missing: run `npm run build:ui` first (sdlc ui will show a placeholder)');
console.log(`built ${out}/sdlc.mjs`);
