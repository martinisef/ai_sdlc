// Project configuration: `.sdlc/config.json` (canonical) or `.claude/sdlc.json` (legacy, still read).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const AGENTS = ['claude', 'cursor', 'agents-md'] as const;
export type AgentId = (typeof AGENTS)[number];
export const ARTIFACTS = ['intent', 'spec', 'plan'] as const;
export type Artifact = (typeof ARTIFACTS)[number];
export const CI_AGENTS = ['claude', 'codex', 'cursor'] as const;
export const NOTIFY_EVENTS = ['gate.pending', 'gate.decided', 'spec.ready', 'review.done', 'change.merged'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export type CiAgent = (typeof CI_AGENTS)[number];
export const RISK_PROFILES = ['strict', 'graded'] as const;
export type RiskProfile = (typeof RISK_PROFILES)[number];

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
      provider: z.enum(['jira', 'github', 'linear', 'none']).optional(),
      /** `jira-sot`: the tracker (Jira, GitHub Issues or Linear) is the source of truth; the name is historical. */
      mode: z.enum(['linkage', 'jira-sot', 'repo-sot']).optional(),
      base_url: z.string().optional(),
      project_key: z.string().optional(),
      /** Linear: team key (`ENG` in `ENG-123`). */
      team_key: z.string().optional(),
      /** GitHub Issues: `owner/repo` when the issues live in another repository than the code. */
      repo: z.string().optional(),
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
  append_only_paths: z.array(z.string()).optional(),
  test_globs: z.array(z.string()).optional(),
  secret_patterns_extra: z.array(z.string()).optional(),
  risk: z
    .looseObject({
      high_risk_paths: z.array(z.string()).optional(),
      /** Paths that are never low risk (default: CI workflows, `.sdlc/**`, REVIEW.md). */
      always_human_paths: z.array(z.string()).optional(),
      /** `strict` (default): every gate needs a person. `graded`: human approvals scale with the tier. */
      profile: z.enum(RISK_PROFILES).optional(),
      /** Human approvals per tier; defaults depend on `profile`. */
      tiers: z.partialRecord(z.enum(['low', 'medium', 'high']), z.looseObject({ approvals: z.number().int().min(0).max(5) })).optional(),
      /** Authors (git name, email or `@login`) who get the lighter paths; everyone else needs another person. */
      trusted_authors: z.array(z.string()).optional(),
      size: z.looseObject({ low_max_lines: z.number().int().min(0).optional(), high_min_lines: z.number().int().positive().optional() }).optional(),
      /** `sdlc ci risk`: also ask the agent whether this change needs another person (it can only raise the tier). */
      agent_escalation: z.boolean().optional(),
    })
    .optional(),
  production_gate: z
    .looseObject({ patterns: z.array(z.string()).optional(), approval_env: z.string().optional() })
    .optional(),
  /** Who may approve each artifact: role names, resolved through `roles`. Empty → anyone but an agent. */
  gates: z.partialRecord(z.enum(ARTIFACTS), z.array(z.string())).optional(),
  /** Solo projects: the author may approve their own spec and plan (agents still cannot). */
  gates_self_approval: z.boolean().optional(),
  /** Role → git emails (or names, or `@login` on the forge) of the people holding it. */
  roles: z.record(z.string(), z.array(z.string())).optional(),
  plugin: z.looseObject({ marketplace_repo: z.string().optional() }).optional(),
  /** `sdlc quick`: small changes without spec and plan, limited on every push. */
  quick_lane: z
    .looseObject({
      enabled: z.boolean().optional(),
      max_files: z.number().int().positive().optional(),
      forbid_paths: z.array(z.string()).optional(),
    })
    .optional(),
  /** `sdlc notify`: loop events to Slack or any webhook (Teams, Discord, …). Off while the webhook env var is unset. */
  notify: z
    .looseObject({
      webhook_env: z.string().optional(),
      format: z.enum(['slack', 'generic']).optional(),
      events: z.array(z.enum(NOTIFY_EVENTS)).optional(),
      /** `@login`, email or git name → Slack member ID, to mention whoever has to act. */
      people: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  /** Headless runs in CI (`sdlc ci …`): which agent CLI to drive. */
  ci: z
    .looseObject({
      agent: z.enum(CI_AGENTS).optional(),
      model: z.string().optional(),
      min_pass_rate: z.number().min(0).max(1).optional(),
      /** `sdlc ci mention`: answer only (read) or also commit requested changes to the PR branch (edit). */
      mention_mode: z.enum(['read', 'edit']).optional(),
      /** `sdlc ci review`: depth (auto follows the risk tier: low quick, medium standard, high deep) and the round cap. */
      review: z
        .looseObject({
          depth: z.enum(['auto', 'quick', 'standard', 'deep']).optional(),
          max_rounds: z.number().int().min(1).max(10).optional(),
        })
        .optional(),
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
