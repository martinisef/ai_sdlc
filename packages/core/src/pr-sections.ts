// Sections every PR/MR description must carry: how it was tested, its risk tier, and how to undo it.
// The author lands the change and owns it; these are what a reader (or the on-call) needs afterwards.
import type { LoadedConfig } from './config.ts';
import { RISK_TIERS, tierRank, type RiskTier } from './risk.ts';

export const DEFAULT_PR_SECTIONS = ['Testing', 'Risk', 'How to revert'];

/** Headings accepted for each default section (case-insensitive), so Spanish PR bodies pass too. */
const ALIASES: Record<string, string[]> = {
  testing: ['testing', 'tests', 'pruebas', 'verification', 'verificación'],
  risk: ['risk', 'riesgo'],
  'how to revert': ['how to revert', 'revert', 'rollback', 'cómo revertir', 'como revertir'],
};

export function requiredPrSections(loaded: LoadedConfig | undefined): string[] {
  return loaded?.config.ci?.pr_sections ?? DEFAULT_PR_SECTIONS;
}

/** `## Heading` → its text up to the next heading of the same or higher level, comments removed. */
export function prSections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = body.replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  let current: string | undefined;
  for (const l of lines) {
    const h = /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) {
      current = h[1].toLowerCase().replace(/[:.]+$/, '').trim();
      out.set(current, '');
    } else if (current) out.set(current, `${out.get(current)}${l}\n`);
  }
  for (const [k, v] of out) out.set(k, v.trim());
  return out;
}

export interface PrBodyCheck {
  ok: boolean;
  missing: string[];
  /** Tier written in the Risk section, if any. */
  declared?: RiskTier;
  problem?: string;
}

/** Are the required sections there and filled in, and does Risk state at least the computed tier? */
export function checkPrBody(body: string, required: string[], tier?: RiskTier): PrBodyCheck {
  const sections = prSections(body);
  const find = (name: string) => {
    const names = ALIASES[name.toLowerCase()] ?? [name.toLowerCase()];
    return [...sections].find(([k]) => names.includes(k))?.[1];
  };
  const missing = required.filter((s) => !find(s));
  const riskRequired = required.some((s) => s.toLowerCase() === 'risk');
  const risk = riskRequired ? find('risk') : undefined;
  const word = risk ? /\b(low|medium|high|bajo|medio|alto)\b/i.exec(risk)?.[1].toLowerCase() : undefined;
  const declared = word ? ((({ bajo: 'low', medio: 'medium', alto: 'high' }) as Record<string, RiskTier>)[word] ?? (word as RiskTier)) : undefined;
  let problem: string | undefined;
  if (missing.length) problem = `the PR description needs ${missing.map((s) => `## ${s}`).join(', ')}`;
  else if (risk !== undefined && !declared) problem = `## Risk must state the tier (${RISK_TIERS.join(', ')})`;
  else if (declared && tier && tierRank(declared) < tierRank(tier)) problem = `## Risk says ${declared}, the change is ${tier} (sdlc risk)`;
  return { ok: !problem, missing, declared, problem };
}
