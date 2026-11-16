// Discovery in the dashboard: the project state from meetings (STATUS.md, open questions, the follow-up draft), upload a
// transcript for the agent to merge in the background, and seed the baseline from the tracker and git.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  addSource,
  discoveryStatus,
  loadConfig,
  loadDiscovery,
  localAgent,
  seedDiscovery,
  skillRef,
  tracker,
  trackerEnabled,
  TRANSCRIPT_EXTENSIONS,
  validateDiscovery,
  type CiAgent,
} from '@ai-native-sdlc/core';
import { readJobs, startJob } from './roadmaps.ts';

export const DISCOVERY_JOB = '_discovery';
const MAX_UPLOAD = 20 * 1024 * 1024;
const TOOLS = 'Read,Write,Edit,Grep,Glob,Bash(git add:*),Bash(git commit:*),Bash(git status),Bash(git grep:*),Bash(git show:*),Bash(ls:*),Bash(.sdlc/bin/sdlc:*),Bash(npx sdlc:*)';

export function discoveryPrompt(agent: CiAgent, file: string, label: string, dir: string): string {
  return (
    `Use ${skillRef(agent, 'sdlc-discovery')} on the transcript ${file}, already registered as "${label}" in ${dir}/_sources.md (skip registering it). ` +
    `Headless run from the dashboard: do not ask questions. Run \`.sdlc/bin/sdlc discovery validate\` until it passes, then \`.sdlc/bin/sdlc discovery status\` and \`.sdlc/bin/sdlc discovery followup --write\`, and commit only ${dir}/. ` +
    'Never write to the tracker.'
  );
}

export function discoveryRoutes(app: Hono, ws: (c: Context) => string) {
  app.get('/api/discovery', (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    const d = loadDiscovery(root, loaded);
    const check = validateDiscovery(root, loaded, d);
    const followups = existsSync(join(root, d.dir, 'followups')) ? readdirSync(join(root, d.dir, 'followups')).filter((f) => f.endsWith('.md')).sort().reverse() : [];
    const latest = followups[0];
    return c.json({
      dir: d.dir,
      started: d.topics.length > 0 || d.sources.length > 0,
      status: discoveryStatus(d),
      errors: check.errors,
      warnings: check.warnings,
      sources: d.sources.map(({ date, name, type, label }) => ({ date, name, type, label })).reverse(),
      topics: d.topics.map((t) => ({ slug: t.slug, title: t.title, rows: t.rows.length })),
      followup: latest ? { path: `${d.dir}/followups/${latest}`, body: readFileSync(join(root, d.dir, 'followups', latest), 'utf8') } : undefined,
      tracker: trackerEnabled(loaded) ? loaded!.config.tracker!.provider : undefined,
      job: readJobs(root).find((j) => j.roadmap === DISCOVERY_JOB),
    });
  });

  app.post('/api/discovery/sources', bodyLimit({ maxSize: MAX_UPLOAD + 1024 * 1024, onError: (c) => c.json({ error: 'the transcript is larger than 20 MB' }, 413) }), async (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    const body = await c.req.parseBody();
    const file = body.file instanceof File ? body.file : undefined;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!file) throw new Error('upload the transcript or the minutes (PDF, Markdown, text, VTT or SRT)');
    if (!name) throw new Error('name the meeting ("Weekly sync"): evidence cites it by date and name');
    const ext = extname(file.name).toLowerCase();
    if (!TRANSCRIPT_EXTENSIONS.includes(ext)) throw new Error(`unsupported transcript ${file.name}: use ${TRANSCRIPT_EXTENSIONS.join(', ')} (export Word or Google Docs to PDF)`);
    if (readJobs(root).some((j) => j.roadmap === DISCOVERY_JOB && j.status === 'running' && j.pid === process.pid)) throw new Error('the agent is still processing the previous meeting; wait until it finishes');
    const tmp = mkdtempSync(join(tmpdir(), 'sdlc-transcript-'));
    try {
      // the original name keeps the date in it (`weekly 2026-05-04.vtt`)
      const path = join(tmp, basename(file.name).replace(/[^\w. -]/g, '_'));
      writeFileSync(path, Buffer.from(await file.arrayBuffer()));
      const date = typeof body.date === 'string' && body.date ? body.date : undefined;
      const type = typeof body.type === 'string' && body.type ? body.type : undefined;
      const added = addSource(root, loaded, path, { name, date, type, force: body.force === 'true' });
      if (added.duplicate) return c.json({ error: `already processed as '${added.duplicate}'` }, 409);
      if (!added.written) return c.json({ error: `${added.date} is older than the last meeting ('${added.olderThan}'): confirm to add it anyway`, olderThan: added.olderThan }, 409);
      const d = loadDiscovery(root, loaded);
      const job = body.agent === 'false' ? undefined : startJob(root, DISCOVERY_JOB, 'discovery', { prompt: discoveryPrompt(localAgent(loaded), added.file, added.label, d.dir), tools: TOOLS });
      return c.json({ source: added, job }, 201);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  app.post('/api/discovery/seed', async (c) => {
    const root = ws(c);
    const loaded = loadConfig(root);
    const { dryRun = false } = await c.req.json<{ dryRun?: boolean }>().catch(() => ({ dryRun: false }));
    return c.json(await seedDiscovery(root, loaded, { dryRun, tracker: () => tracker(loaded, process.env, root) }));
  });
}
