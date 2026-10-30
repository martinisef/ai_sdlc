// Project configuration: `.sdlc/config.json` (canonical) or `.claude/sdlc.json` (legacy, still read).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const AGENTS = ['claude', 'cursor', 'agents-md'] as const;
export type AgentId = (typeof AGENTS)[number];
export const ARTIFACTS = ['intent', 'spec', 'plan'] as const;
export type Artifact = (typeof ARTIFACTS)[number];
export const CI_AGENTS = ['claude', 'codex', 'cursor'] as const;
export type CiAgent = (typeof CI_AGENTS)[number];

const commandMap = z.record(z.string(), z.string());

export const ConfigSchema = z.looseObject({
  version: z.literal(1),
  locale: z.enum(['en', 'es']).optional(),
  agents: z.array(z.enum(AGENTS)).optional(),
  vcs: z
    .looseObject({
      provider: z.enum(['github', 'gitlab', 'bitbucket']).optional(),
      host: z.string().optional(),
      workspace: z.string().optional(),
      repo: z.string().optional(),
      default_branch: z.string().optional(),
    })
    .optional(),
  tracker: z
    .looseObject({
      provider: z.enum(['jira', 'none']).optional(),
      mode: z.enum(['linkage', 'jira-sot', 'repo-sot']).optional(),
      base_url: z.string().optional(),
      project_key: z.string().optional(),
      default_issue_type: z.string().optional(),
      incident_issue_type: z.string().optional(),
      transitions: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  stack: z
    .looseObject({ language: z.string().optional(), package_manager: z.string().optional(), project_type: z.string().optional() })
    .optional(),
  commands: z
    .looseObject({
      build: z.string().optional(),
      test: z.string().optional(),
      lint: z.string().optional(),
      format: z.string().optional(),
      run: z.string().optional(),
    })
    .optional(),
  format_on_edit: commandMap.optional(),
  protected_paths: z.array(z.string()).optional(),
  test_globs: z.array(z.string()).optional(),
  secret_patterns_extra: z.array(z.string()).optional(),
  risk: z.looseObject({ high_risk_paths: z.array(z.string()).optional() }).optional(),
  production_gate: z
    .looseObject({ patterns: z.array(z.string()).optional(), approval_env: z.string().optional() })
    .optional(),
  /** Who may approve each artifact: role names, resolved through `roles`. Empty → anyone but an agent. */
  gates: z.partialRecord(z.enum(ARTIFACTS), z.array(z.string())).optional(),
  /** Role → git emails (or names) of the people holding it. */
  roles: z.record(z.string(), z.array(z.string())).optional(),
  plugin: z.looseObject({ marketplace_repo: z.string().optional() }).optional(),
  /** Headless runs in CI (`sdlc ci …`): which agent CLI to drive. */
  ci: z
    .looseObject({
      agent: z.enum(CI_AGENTS).optional(),
      model: z.string().optional(),
      min_pass_rate: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const CONFIG_PATH = '.sdlc/config.json';
export const LEGACY_CONFIG_PATH = '.claude/sdlc.json';

export interface LoadedConfig {
  config: Config;
  /** Path relative to the project root. */
  path: string;
  legacy: boolean;
  /** Validation problems; the config is still usable (hooks must never crash on a typo). */
  issues: string[];
}

export function configPath(root: string): { path: string; legacy: boolean } | undefined {
  if (existsSync(join(root, CONFIG_PATH))) return { path: CONFIG_PATH, legacy: false };
  if (existsSync(join(root, LEGACY_CONFIG_PATH))) return { path: LEGACY_CONFIG_PATH, legacy: true };
  return undefined;
}

export function loadConfig(root: string): LoadedConfig | undefined {
  const found = configPath(root);
  if (!found) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(root, found.path), 'utf8'));
  } catch (e) {
    return { config: { version: 1 }, ...found, issues: [`invalid JSON: ${(e as Error).message}`] };
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (parsed.success) return { config: parsed.data, ...found, issues: [] };
  return { config: raw as Config, ...found, issues: formatIssues(parsed.error) };
}

export function validateConfig(raw: unknown): { ok: true; config: Config } | { ok: false; issues: string[] } {
  const parsed = ConfigSchema.safeParse(raw);
  return parsed.success ? { ok: true, config: parsed.data } : { ok: false, issues: formatIssues(parsed.error) };
}

function formatIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

export function writeConfig(root: string, config: Config, path = CONFIG_PATH): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(config, null, 2) + '\n');
}

/** Locale: explicit config wins; legacy (.claude/sdlc.json) projects were written in Spanish. */
export function localeOf(loaded: LoadedConfig | undefined): 'en' | 'es' {
  return loaded?.config.locale ?? (loaded?.legacy ? 'es' : 'en');
}

export function configJsonSchema(): unknown {
  return z.toJSONSchema(ConfigSchema, { io: 'input' });
}
