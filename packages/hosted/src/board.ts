// The org board: the same stage rules as `listChanges`, read through the GitHub API instead of a clone.
import { ARTIFACTS, isApproved, isCodePath, parseFrontmatter, slugOf, stageOf, type Artifact, type Stage } from '@ai-native-sdlc/core';
import type { Branch, GithubClient } from './github.ts';

export interface RemoteChange {
  repo: string;
  dir: string;
  slug: string;
  /** Branch the artifacts were read from. */
  ref: string;
  branch?: string;
  stage: Stage;
  statuses: string;
  waitingFor?: Artifact;
  title?: string;
  ticket?: string;
  risk?: string;
  origin?: string;
  author?: string;
}

const ARTIFACT_PATH = /^changes\/([^/]+)\/(intent|spec|plan)\.md$/;

export async function repoChanges(gh: GithubClient, repo: string, defaultBranch: string): Promise<RemoteChange[]> {
  const branches = await gh.branches(repo);
  const byName = new Map<string, Branch>(branches.map((b) => [b.name, b]));
  const base = byName.get(defaultBranch);
  const refs = [...(base ? [base] : []), ...branches.filter((b) => b.name.startsWith('change/'))];

  // dir → artifact → { ref, path }; the change's own branch wins over the default branch
  const found = new Map<string, Map<Artifact, { ref: Branch; path: string }>>();
  const ownBranch = (dir: string) => [`change/${dir}`, `change/${slugOf(dir)}`].find((n) => byName.has(n));
  for (const ref of refs) {
    for (const path of await gh.tree(repo, ref.commit.sha)) {
      const m = ARTIFACT_PATH.exec(path);
      if (!m || m[1].startsWith('_')) continue;
      const [, dir, artifact] = m;
      if (ref.name !== defaultBranch && ownBranch(dir) !== ref.name) continue;
      const slot = found.get(dir) ?? new Map();
      if (!slot.has(artifact as Artifact) || ref.name !== defaultBranch) slot.set(artifact as Artifact, { ref, path });
      found.set(dir, slot);
    }
  }

  const out: RemoteChange[] = [];
  for (const [dir, slot] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
    const artifacts: Partial<Record<Artifact, { status?: string; data: Record<string, string>; body: string }>> = {};
    let ref = defaultBranch;
    for (const a of ARTIFACTS) {
      const at = slot.get(a);
      if (!at) continue;
      const raw = await gh.file(repo, at.path, at.ref.commit.sha);
      if (raw === undefined) continue;
      const { data, body } = parseFrontmatter(raw);
      artifacts[a] = { status: data.status || undefined, data, body };
      if (at.ref.name !== defaultBranch) ref = at.ref.name;
    }
    const branch = ownBranch(dir);
    let stage = stageOf(artifacts);
    if (stage === 'plan-approved') {
      if (branch && (await gh.changedFiles(repo, defaultBranch, branch)).some(isCodePath)) stage = 'building';
      else if (!branch && slot.get('plan')?.ref.name === defaultBranch) stage = 'merged';
    }
    const intent = artifacts.intent;
    out.push({
      repo,
      dir,
      slug: slugOf(dir),
      ref,
      branch,
      stage,
      statuses: ARTIFACTS.map((a) => artifacts[a]?.status ?? '-').join('/'),
      waitingFor: ARTIFACTS.slice()
        .reverse()
        .find((a) => artifacts[a] && !isApproved(artifacts[a]!.status) && artifacts[a]!.status !== 'rejected'),
      title: (intent ?? artifacts.spec ?? artifacts.plan)?.body.match(/^#\s+(?:[^:\n]+:\s*)?(.+)$/m)?.[1]?.trim(),
      ticket: intent?.data.ticket || undefined,
      risk: artifacts.spec?.data.risk || artifacts.plan?.data.risk || undefined,
      origin: intent?.data.origin || undefined,
      author: intent?.data.author || undefined,
    });
  }
  return out;
}
