// Module explainers (docs/explainers/<module>.md, written by /sdlc-explain): architecture, invariants and risks of
// one module. /sdlc-plan cites the ones a plan touches; staleness is the module's last commit against `source_sha`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.ts';
import { git } from './git.ts';

export const EXPLAINERS_DIR = 'docs/explainers';

export interface Explainer {
  module: string;
  path: string;
  sourceSha?: string;
  updated?: string;
  /** Last commit that touched the module. */
  moduleSha?: string;
  /** The module changed after the explainer was written (or the explainer does not say when it was). */
  stale: boolean;
}

const trimSlash = (p: string) => p.replace(/^\.\//, '').replace(/\/+$/, '');

/** `src/billing` → `docs/explainers/src-billing.md`. */
export function explainerPath(module: string): string {
  return `${EXPLAINERS_DIR}/${trimSlash(module).replaceAll('/', '-')}.md`;
}

export function listExplainers(root: string): Explainer[] {
  const dir = join(root, EXPLAINERS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .flatMap((f) => {
      const { data } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'));
      if (!data.module) return [];
      const module = trimSlash(data.module);
      const sourceSha = data.source_sha || undefined;
      const moduleSha = git(root, ['log', '-1', '--format=%H', '--', module]) || undefined;
      const current =
        !!sourceSha && !!moduleSha && (moduleSha.startsWith(sourceSha) || git(root, ['merge-base', '--is-ancestor', moduleSha, sourceSha]) !== undefined);
      return [{ module, path: `${EXPLAINERS_DIR}/${f}`, sourceSha, updated: data.updated || undefined, moduleSha, stale: !current }];
    });
}

/** Explainers of the modules that contain any of `files` (paths relative to the root). */
export function explainersFor(root: string, files: string[]): Explainer[] {
  const fs = files.map(trimSlash);
  return listExplainers(root).filter((e) => fs.some((f) => f === e.module || f.startsWith(`${e.module}/`)));
}
