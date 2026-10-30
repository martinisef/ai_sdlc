// Canonical content (content/<locale>/{skills,agents}): loaded once, rendered per agent.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, type Locale } from '@ai-native-sdlc/core';

export interface ContentFile {
  /** path relative to the skill/agent root */
  rel: string;
  content: string;
  executable: boolean;
}

export interface Skill {
  name: string;
  description: string;
  argumentHint?: string;
  files: ContentFile[];
}

export interface SubAgent {
  name: string;
  description: string;
  raw: string;
  body: string;
}

const here = dirname(fileURLToPath(import.meta.url));

/** content/ next to the bundle (dist/content), or the repo's content/ in development. */
export function contentDir(): string {
  const candidates = [process.env.SDLC_CONTENT_DIR, join(here, 'content'), join(here, '..', 'content'), join(here, '..', '..', '..', 'content')];
  const found = candidates.find((c) => c && existsSync(join(c, 'en', 'skills')));
  if (!found) throw new Error(`ai-sdlc content not found (looked in: ${candidates.filter(Boolean).join(', ')})`);
  return found;
}

function walk(dir: string, root = dir): ContentFile[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) return walk(full, root);
    return [{ rel: relative(root, full), content: readFileSync(full, 'utf8'), executable: (st.mode & 0o111) !== 0 }];
  });
}

/** content/<locale>; English is the source of truth, other locales fall back to it. */
export function localeDir(locale: Locale): string {
  const base = contentDir();
  return existsSync(join(base, locale, 'skills')) ? join(base, locale) : join(base, 'en');
}

export function loadSkills(locale: Locale): Skill[] {
  const dir = join(localeDir(locale), 'skills');
  return readdirSync(dir)
    .filter((n) => existsSync(join(dir, n, 'SKILL.md')))
    .sort()
    .map((name) => {
      const files = walk(join(dir, name));
      const { data } = parseFrontmatter(files.find((f) => f.rel === 'SKILL.md')!.content);
      return { name, description: data.description ?? '', argumentHint: data['argument-hint']?.replace(/^"|"$/g, ''), files };
    });
}

export function loadAgents(locale: Locale): SubAgent[] {
  const dir = join(localeDir(locale), 'agents');
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((file) => {
      const raw = readFileSync(join(dir, file), 'utf8');
      const { data, body } = parseFrontmatter(raw);
      return { name: data.name ?? file.replace(/\.md$/, ''), description: data.description ?? '', raw, body };
    });
}

export function renderText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}
