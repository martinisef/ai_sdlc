// Learnings: a correction a person confirmed ("keep that for next time") becomes one dated line under
// "Things Claude gets wrong" in CLAUDE.md, and in AGENTS.md when that adapter is on (outside the block `sdlc sync`
// owns). Every agent already reads those files, so the same correction is not needed twice.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localeOf, type LoadedConfig } from './config.ts';
import { recordEvent } from './events.ts';
import { gitUser } from './git.ts';
import { SdlcError } from './http.ts';
import { checkSecrets } from './policies.ts';

/** Headings accepted as the learnings section; the first of each locale is the one written. */
export const LEARN_HEADINGS = {
  en: ['Things Claude gets wrong', 'Things the agent gets wrong'],
  es: ['Cosas que Claude hace mal', 'Cosas que el agente hace mal'],
};
const ALL_HEADINGS = [...LEARN_HEADINGS.en, ...LEARN_HEADINGS.es];
const BLOCK_START = '<!-- ai-sdlc:start';
const BLOCK_END = '<!-- ai-sdlc:end -->';
const SUFFIX = /\s*\((?:learned|aprendido) (\d{4}-\d{2}-\d{2})(?:,\s*([^)]*))?\)\s*$/;
export const LEARN_MAX_LINES = 30;

export interface Learning {
  file: string;
  line: number;
  text: string;
  date?: string;
  source?: string;
}

export interface AddLearning {
  text: string;
  change?: string;
  stage?: string;
  today?: string;
}

export interface LearnResult {
  text: string;
  files: string[];
  duplicateIn: string[];
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Files the learnings go to: CLAUDE.md (created when missing), and AGENTS.md when the agents-md adapter is on. */
export function learnFiles(root: string, loaded: LoadedConfig | undefined): string[] {
  const agents = loaded?.config.agents ?? ['claude'];
  const out: string[] = [];
  if (existsSync(join(root, 'CLAUDE.md')) || agents.includes('claude') || agents.includes('cursor') || !agents.includes('agents-md')) out.push('CLAUDE.md');
  if (agents.includes('agents-md')) out.push('AGENTS.md');
  return out;
}

interface Section {
  start: number;
  end: number;
}

/** The learnings section outside the generated AGENTS.md block: heading line to the next `#`/`##` heading. */
function findSection(lines: string[]): Section | undefined {
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(BLOCK_START)) inBlock = true;
    if (inBlock) {
      if (lines[i].includes(BLOCK_END)) inBlock = false;
      continue;
    }
    const m = /^##\s+(.+?)\s*$/.exec(lines[i]);
    if (!m || !ALL_HEADINGS.some((h) => norm(h) === norm(m[1]))) continue;
    let end = i + 1;
    while (end < lines.length && !/^#{1,2}\s/.test(lines[end]) && !lines[end].startsWith(BLOCK_START)) end++;
    return { start: i, end };
  }
  return undefined;
}

function parseFile(root: string, file: string): Learning[] {
  const p = join(root, file);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf8').split('\n');
  const s = findSection(lines);
  if (!s) return [];
  const out: Learning[] = [];
  for (let i = s.start + 1; i < s.end; i++) {
    const m = /^\s*[-*]\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    const suffix = SUFFIX.exec(m[1]);
    out.push({ file, line: i + 1, text: m[1].replace(SUFFIX, '').trim(), date: suffix?.[1], source: suffix?.[2]?.trim() || undefined });
  }
  return out;
}

export function listLearnings(root: string, loaded: LoadedConfig | undefined): Learning[] {
  return learnFiles(root, loaded).flatMap((f) => parseFile(root, f));
}

/** Lines in the learnings section of a file, comments and blanks excluded (doctor warns past LEARN_MAX_LINES). */
export function learningsSize(root: string, file = 'CLAUDE.md'): number {
  return parseFile(root, file).length;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

export function addLearning(root: string, loaded: LoadedConfig | undefined, o: AddLearning): LearnResult {
  const locale = localeOf(loaded);
  const text = o.text.replace(/\s+/g, ' ').trim().replace(/^[-*]\s+/, '');
  if (!text) throw new SdlcError('usage: sdlc learn "<what to do differently next time>"');
  if (text.length > 300) throw new SdlcError(`a learning is one line of at most 300 characters (this one has ${text.length}); say the rule, not the story`);
  const secret = checkSecrets({ root, loaded }, text, locale);
  if (secret.action === 'deny') throw new SdlcError(secret.message ?? 'the learning looks like it contains a secret');
  for (const [k, v] of [['--change', o.change], ['--stage', o.stage]] as const) if (v && !ID.test(v)) throw new SdlcError(`${k} takes a name like spec or 2026-11-claims-export, not '${v}'`);
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const source = [o.stage && `/sdlc-${o.stage.replace(/^sdlc-/, '')}`, o.change].filter(Boolean).join(' ');
  const word = locale === 'es' ? 'aprendido' : 'learned';
  const entry = `- ${text} (${word} ${today}${source ? `, ${source}` : ''})`;
  const files: string[] = [];
  const duplicateIn: string[] = [];
  for (const file of learnFiles(root, loaded)) {
    if (parseFile(root, file).some((l) => norm(l.text) === norm(text))) {
      duplicateIn.push(file);
      continue;
    }
    const p = join(root, file);
    const current = existsSync(p) ? readFileSync(p, 'utf8') : '';
    const lines = current ? current.replace(/\n+$/, '').split('\n') : [];
    const s = findSection(lines);
    if (s) {
      let at = s.end;
      while (at > s.start + 1 && !lines[at - 1].trim()) at--;
      lines.splice(at, 0, entry);
    } else {
      if (!lines.length) lines.push(file === 'AGENTS.md' ? '# AGENTS.md' : '# CLAUDE.md');
      lines.push('', `## ${LEARN_HEADINGS[locale][0]}`, entry);
    }
    writeFileSync(p, lines.join('\n') + '\n');
    files.push(file);
  }
  if (files.length) recordEvent(root, { type: 'rule.learned', change: o.change, artifact: o.stage, by: gitUser(root)?.name, detail: text });
  return { text, files, duplicateIn };
}
