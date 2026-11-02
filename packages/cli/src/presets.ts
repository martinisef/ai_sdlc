// Presets: a patch over the detected config, so `sdlc init` asks three questions instead of twenty.
import type { Config } from '@ai-native-sdlc/core';

export const PRESETS = ['solo', 'team-github', 'regulated'] as const;
export type Preset = (typeof PRESETS)[number];

export interface PresetSpec {
  description: string;
  /** Whether init asks for the PO and the tech lead. */
  roles: boolean;
  /** GitHub workflows installed by `sdlc ci install` (GitLab and Bitbucket always get their single pipeline). */
  github: string[];
  apply(config: Config): Config;
}

export const PRESET_SPECS: Record<Preset, PresetSpec> = {
  solo: {
    description: 'one developer: any person (never an agent) approves gates; CI runs build + triage',
    roles: false,
    github: ['ci.yml'],
    apply: (c) => ({ ...c, gates: {}, roles: {}, gates_self_approval: true }),
  },
  'team-github': {
    description: 'team with a PO and a tech lead: gates by role, review + loop + gates workflows, GitHub Issues as tracker',
    roles: true,
    github: ['ci.yml', 'sdlc-review.yml', 'sdlc-loop.yml', 'sdlc-gates.yml'],
    apply: (c) => ({
      ...c,
      gates: { intent: ['po'], spec: ['po'], plan: ['tech-lead'] },
      ...(c.vcs?.provider === 'github' && (c.tracker?.provider ?? 'none') === 'none' ? { tracker: { provider: 'github', mode: 'linkage' } } : {}),
    }),
  },
  regulated: {
    description: 'team preset plus high-risk paths, tech lead on every plan, nightly evals and control bands',
    roles: true,
    github: ['ci.yml', 'sdlc-review.yml', 'sdlc-loop.yml', 'sdlc-gates.yml', 'sdlc-evals.yml', 'sdlc-bands.yml'],
    apply: (c) => ({
      ...c,
      gates: { intent: ['po'], spec: ['po', 'tech-lead'], plan: ['tech-lead'] },
      risk: { ...c.risk, high_risk_paths: c.risk?.high_risk_paths?.length ? c.risk.high_risk_paths : ['**/auth/**', '**/payments/**', 'infra/**', '**/migrations/**'] },
    }),
  },
};

export function isPreset(p: unknown): p is Preset {
  return typeof p === 'string' && (PRESETS as readonly string[]).includes(p);
}

/** Default when the user does not pick one: GitHub remotes get the team preset. */
export function defaultPreset(config: Config): Preset {
  return config.vcs?.provider === 'github' ? 'team-github' : 'solo';
}

/** `@login, a@b.com` → ['@login', 'a@b.com']; bare logins get the `@`. */
export function parsePeople(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.includes('@') || x.includes(' ') ? x : `@${x}`));
}
