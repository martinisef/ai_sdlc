// `sdlc doctor --fix`: one idempotent repair per failing check. What needs a person (credentials,
// hand-edited files, an invalid config) is reported with the command to run, never guessed.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { doctor, sync, type Check } from '@ai-native-sdlc/adapters';
import { CONFIG_PATH, detectProvider, ensureSdlcDir, LEGACY_CONFIG_PATH, loadConfig, localeOf, writeConfig, type LoadedConfig } from '@ai-native-sdlc/core';
import { installCi } from './ci/install.ts';
import { detectConfig } from './init.ts';
import { PRESET_SPECS } from './presets.ts';

export interface FixResult {
  id: string;
  fixed: boolean;
  message: string;
}

export function migrateLegacy(root: string): void {
  const config = JSON.parse(readFileSync(join(root, LEGACY_CONFIG_PATH), 'utf8'));
  config.locale ??= 'es';
  config.agents ??= ['claude'];
  writeConfig(root, config);
  rmSync(join(root, LEGACY_CONFIG_PATH));
  if (existsSync(join(root, '.claude/.sdlc-fix-lock'))) {
    ensureSdlcDir(root);
    writeFileSync(join(root, '.sdlc/fix-lock'), '');
    rmSync(join(root, '.claude/.sdlc-fix-lock'));
  }
}

const SYNC_FIXES = new Set(['git-hooks', 'shim', 'cursor', 'agents-md']);

const MANUAL: Record<string, string> = {
  git: 'git init (artifacts and gates live in git)',
  config: 'fix the reported fields in .sdlc/config.json (sdlc ui → Settings validates them)',
  cli: 'npm i -D @morsadev/sdlc (or npm i -g @morsadev/sdlc)',
  vcs: 'set vcs.provider in .sdlc/config.json or add an origin remote',
  gh: 'install the GitHub CLI: https://cli.github.com',
  glab: 'install the GitLab CLI: https://gitlab.com/gitlab-org/cli',
  drift: 'review the hand edits, then sdlc sync --force to regenerate',
  bands: 'fix ops/bands.yaml (sdlc bands check --dry-run)',
};

function presetFiles(loaded: LoadedConfig): string[] {
  const gates = loaded.config.gates ?? {};
  if (!Object.keys(gates).length) return PRESET_SPECS.solo.github;
  return PRESET_SPECS['team-github'].github;
}

export function fixDoctor(root: string, checks: Check[] = doctor(root).checks): FixResult[] {
  const out: FixResult[] = [];
  const failing = checks.filter((c) => !c.ok);
  let synced = false;
  for (const c of failing) {
    if (c.id === 'config' && !loadConfig(root)) {
      out.push({ id: c.id, fixed: false, message: 'no config: run sdlc init (it asks three questions)' });
      continue;
    }
    if (c.id === 'config-legacy') {
      migrateLegacy(root);
      out.push({ id: c.id, fixed: true, message: `moved ${LEGACY_CONFIG_PATH} → ${CONFIG_PATH}` });
      continue;
    }
    const loaded = loadConfig(root);
    if (!loaded) continue;
    if (c.id.startsWith('command.')) {
      const k = c.id.slice('command.'.length) as 'build' | 'test' | 'lint';
      const detected = detectConfig(root, localeOf(loaded)).commands?.[k];
      if (detected && (!/^make /.test(detected) || existsSync(join(root, 'Makefile')))) {
        writeConfig(root, { ...loaded.config, commands: { ...loaded.config.commands, [k]: detected } });
        out.push({ id: c.id, fixed: true, message: `commands.${k} = ${detected} (detected from the stack)` });
      } else out.push({ id: c.id, fixed: false, message: `set commands.${k} in .sdlc/config.json (no stack detected to infer it)` });
      continue;
    }
    if (SYNC_FIXES.has(c.id)) {
      if (!synced) {
        const r = sync(root, loaded);
        synced = true;
        out.push({ id: c.id, fixed: true, message: `sdlc sync: ${r.written.length} file(s) written${r.hooksPath?.set ? ', git hooks installed' : ''}` });
      } else out.push({ id: c.id, fixed: true, message: 'covered by sdlc sync' });
      continue;
    }
    if (c.id === 'ci') {
      const provider = detectProvider(root, loaded);
      if (!provider) {
        out.push({ id: c.id, fixed: false, message: MANUAL.vcs });
        continue;
      }
      const r = installCi(root, loaded.config, { provider, locale: localeOf(loaded), files: presetFiles(loaded) });
      out.push({ id: c.id, fixed: r.written.length > 0, message: r.written.length ? `sdlc ci install: ${r.written.join(', ')}` : `kept existing ${r.conflicts.join(', ')}` });
      continue;
    }
    out.push({ id: c.id, fixed: false, message: MANUAL[c.id] ?? c.message });
  }
  return out;
}
