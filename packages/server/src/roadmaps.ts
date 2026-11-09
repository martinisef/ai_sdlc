// Roadmaps in the dashboard: upload a technical plan, let the agent draft the breakdown in the background, answer its
// questions, decide the gate and create the tickets. Agent runs are jobs in .sdlc/jobs/<id>.json (gitignored).
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  applyRoadmap,
  approvalHolds,
  canDecideRoadmap,
  checkRoadmap,
  decideRoadmap,
  getRoadmap,
  gitOrThrow,
  gitUser,
  listRoadmaps,
  loadConfig,
  MAX_SOURCE_BYTES,
  agentBin,
  hasTool,
  localAgent,
  isGoogleDocUrl,
  canDeleteRoadmap,
  deleteRoadmap,
  newRoadmap,
  roadmapPath,
  roadmapStatus,
  runAgentAsync,
  setAnswers,
  skillRef,
  SOURCE_EXTENSIONS,
  tracker,
  trackerEnabled,
  type CiAgent,
  type Roadmap,
} from '@ai-native-sdlc/core';

export interface Job {
  id: string;
  /** draft: from the document · refine: after the person answered the open questions. */
  kind: 'draft' | 'refine';
  roadmap: string;
  agent: CiAgent;
  status: 'running' | 'done' | 'failed';
  started: string;
  finished?: string;
  /** The last few KB of the agent's stderr. */
  log: string;
  answer?: string;
  error?: string;
  pid: number;
}

export const JOBS_DIR = '.sdlc/jobs';
const LOG_TAIL = 8 * 1024;
const EDIT_TOOLS = 'Read,Write,Edit,Grep,Glob,Bash(git add:*),Bash(git commit:*),Bash(git status),Bash(ls:*),Bash(.sdlc/bin/sdlc:*),Bash(npx sdlc:*)';

/** (root, job) on every job update; /api/stream forwards them as `job` events. */
export const jobEvents = new EventEmitter();
const running = new Set<string>();

function saveJob(root: string, job: Job) {
  mkdirSync(join(root, JOBS_DIR), { recursive: true });
  writeFileSync(join(root, JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2));
  jobEvents.emit('job', root, job);
}

/** Newest first. A job left running by a dashboard that is no longer up is reported as interrupted. */
export function readJobs(root: string): Job[] {
  const dir = join(root, JOBS_DIR);
  if (!existsSync(dir)) return [];
  const jobs: Job[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Job;
      jobs.push(j.status === 'running' && j.pid !== process.pid ? { ...j, status: 'failed', error: 'interrupted: the dashboard stopped while the agent was working' } : j);
    } catch {
      // half-written or foreign file
    }
  }
  return jobs.sort((a, b) => b.started.localeCompare(a.started));
}

export function roadmapPrompt(agent: CiAgent, slug: string, kind: Job['kind']): string {
  const file = roadmapPath(slug);
  const headless = `Headless run from the dashboard: do not ask questions; write each open question with an empty \`A:\` line, the person answers them in the dashboard. Run \`.sdlc/bin/sdlc roadmap check ${slug}\`, then commit only changes/_roadmaps/${slug}/. Never approve the roadmap or create tickets.`;
  return kind === 'draft'
    ? `Use ${skillRef(agent, 'sdlc-roadmap')} to draft the roadmap ${slug} (${file}) from its source document. ${headless}`
    : `Use ${skillRef(agent, 'sdlc-roadmap')} on the roadmap ${slug}: the person answered open questions in ${file}. Keep the answers, update the epics and stories they affect, and add a question only if an answer opens a new one. ${headless}`;
}

export function startJob(root: string, slug: string, kind: Job['kind']): Job {
  const key = `${root}#${slug}`;
  if (running.has(key)) throw new Error(`the agent is already working on ${slug}`);
  const loaded = loadConfig(root);
  const agent = localAgent(loaded);
  const job: Job = { id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`, kind, roadmap: slug, agent, status: 'running', started: new Date().toISOString(), log: '', pid: process.pid };
  running.add(key);
  saveJob(root, job);
  let saved = 0;
  const log = (chunk: string) => {
    job.log = (job.log + chunk).slice(-LOG_TAIL);
    if (Date.now() - saved > 1000) {
      saved = Date.now();
      saveJob(root, job);
    }
  };
  const model = process.env.SDLC_CI_MODEL || loaded?.config.ci?.model;
  runAgentAsync(agent, { prompt: roadmapPrompt(agent, slug, kind), mode: 'edit', allowedTools: EDIT_TOOLS, cwd: root, log }, model)
    .then((answer) => {
      job.status = 'done';
      job.answer = answer.slice(-4000);
    })
    .catch((e: Error) => {
      job.status = 'failed';
      job.error = e.message;
    })
    .finally(() => {
      job.finished = new Date().toISOString();
      running.delete(key);
      saveJob(root, job);
    });
  return job;
}

const busy = (root: string, slug: string) => {
  if (running.has(`${root}#${slug}`)) throw new Error(`the agent is still working on ${slug}; wait until it finishes`);
};

function brief(r: Roadmap) {
  const c = checkRoadmap(r);
  return {
    slug: r.slug,
    title: r.title,
    path: r.path,
    status: r.data.status || 'draft',
    source: r.data.source,
    epics: c.epics,
    stories: c.stories,
    open: c.open,
    errors: c.errors,
    warnings: c.warnings,
    tickets: r.items.filter((i) => i.fields.key).length,
    items: r.items.length,
  };
}

export function roadmapRoutes(app: Hono, ws: (c: Context) => string) {
  app.get('/api/agent', (c) => {
    const agent = localAgent(loadConfig(ws(c)));
    const bin = agentBin(agent);
    return c.json({ agent, bin, installed: hasTool(bin) });
  });

  app.get('/api/roadmaps', (c) => {
    const root = ws(c);
    const jobs = readJobs(root);
    const canDecide = canDecideRoadmap(gitUser(root), loadConfig(root));
    return c.json(listRoadmaps(root).map((r) => ({ ...brief(r), canDecide, job: jobs.find((j) => j.roadmap === r.slug) })));
  });

  app.post(
    '/api/roadmaps',
    bodyLimit({ maxSize: MAX_SOURCE_BYTES + 1024 * 1024, onError: (c) => c.json({ error: `the document is larger than ${MAX_SOURCE_BYTES / 1024 / 1024} MB` }, 413) }),
    async (c) => {
      const root = ws(c);
      const body = await c.req.parseBody();
      const slug = String(body.slug ?? '').trim();
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
      const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : undefined;
      const file = body.file instanceof File ? body.file : undefined;
      if (url && !/^https?:\/\//.test(url)) throw new Error('the link must start with http:// or https://');
      if (!file && !url) throw new Error('upload the technical plan (PDF, Markdown or text) or give its link');
      if (url && !file && !isGoogleDocUrl(url)) throw new Error('the dashboard reads Google Docs links; for other links, download the document and upload it');
      let tmp: string | undefined;
      let source = url;
      if (file) {
        const ext = extname(file.name).toLowerCase();
        if (!SOURCE_EXTENSIONS.includes(ext)) throw new Error(`unsupported document ${file.name}: use ${SOURCE_EXTENSIONS.join(', ')} (export Word or Google Docs to PDF)`);
        if (file.size > MAX_SOURCE_BYTES) return c.json({ error: `the document is larger than ${MAX_SOURCE_BYTES / 1024 / 1024} MB` }, 413);
        tmp = mkdtempSync(join(tmpdir(), 'sdlc-upload-'));
        source = join(tmp, `plan${ext}`);
        writeFileSync(source, Buffer.from(await file.arrayBuffer()));
      }
      let created: Awaited<ReturnType<typeof newRoadmap>>;
      try {
        created = await newRoadmap(root, slug, { source, title, loaded: loadConfig(root) });
      } finally {
        if (tmp) rmSync(tmp, { recursive: true, force: true });
      }
      const job = body.agent === 'false' ? undefined : startJob(root, slug, 'draft');
      return c.json({ slug, path: created.path, source: created.source, job }, 201);
    },
  );

  app.get('/api/roadmaps/:slug', (c) => {
    const root = ws(c);
    const slug = c.req.param('slug');
    if (!existsSync(join(root, roadmapPath(slug)))) return c.json({ error: 'not found' }, 404);
    const loaded = loadConfig(root);
    const r = getRoadmap(root, slug);
    const jobs = readJobs(root).filter((j) => j.roadmap === slug);
    return c.json({
      ...brief(r),
      data: r.data,
      raw: r.raw,
      questions: r.questions,
      tree: r.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, epic: i.epic, fields: i.fields, description: i.description, criteria: i.criteria, depends: i.depends })),
      canDecide: canDecideRoadmap(gitUser(root), loaded),
      canDelete: canDeleteRoadmap(r, gitUser(root)),
      holds: approvalHolds(r),
      progress: roadmapStatus(root, loaded, slug),
      tracker: trackerEnabled(loaded) ? loaded!.config.tracker!.provider : undefined,
      job: jobs[0],
      jobs: jobs.slice(0, 5),
    });
  });

  app.post('/api/roadmaps/:slug/answers', async (c) => {
    const root = ws(c);
    const slug = c.req.param('slug');
    busy(root, slug);
    const { answers, rerun = true } = await c.req.json<{ answers: Record<string, string>; rerun?: boolean }>();
    const r = getRoadmap(root, slug);
    const raw = setAnswers(r.raw, answers ?? {});
    if (raw !== r.raw) {
      writeFileSync(join(root, r.path), raw);
      gitOrThrow(root, ['add', '--', r.path]);
      gitOrThrow(root, ['commit', '-q', '-m', `docs(roadmap-${slug}): answer open questions`, '--', r.path]);
    }
    const job = rerun && raw !== r.raw ? startJob(root, slug, 'refine') : undefined;
    return c.json({ ok: true, changed: raw !== r.raw, job, ...brief(getRoadmap(root, slug)) });
  });

  app.post('/api/roadmaps/:slug/gate', async (c) => {
    const root = ws(c);
    const slug = c.req.param('slug');
    busy(root, slug);
    const body = await c.req.json<{ decision: 'approved' | 'rejected'; comment?: string }>();
    return c.json(decideRoadmap(root, loadConfig(root), slug, body.decision === 'rejected' ? 'rejected' : 'approved', { comment: body.comment }));
  });

  app.delete('/api/roadmaps/:slug', (c) => {
    const root = ws(c);
    const slug = c.req.param('slug');
    busy(root, slug);
    const res = deleteRoadmap(root, slug);
    for (const j of readJobs(root).filter((j) => j.roadmap === res.slug)) rmSync(join(root, JOBS_DIR, `${j.id}.json`), { force: true });
    return c.json(res);
  });

  app.post('/api/roadmaps/:slug/apply', async (c) => {
    const root = ws(c);
    const slug = c.req.param('slug');
    busy(root, slug);
    const { dryRun = false } = await c.req.json<{ dryRun?: boolean }>().catch(() => ({ dryRun: false }));
    const loaded = loadConfig(root);
    const holds = approvalHolds(getRoadmap(root, slug));
    if (!holds.ok) throw new Error(holds.reason);
    if (!dryRun && !trackerEnabled(loaded)) throw new Error('tracker not configured (tracker.provider: jira | github | linear): Settings → Tracker');
    return c.json(await applyRoadmap(root, loaded, slug, { dryRun, tracker: () => tracker(loaded, process.env, root) }));
  });

  app.get('/api/jobs/:id', (c) => {
    const job = readJobs(ws(c)).find((j) => j.id === c.req.param('id'));
    return job ? c.json(job) : c.json({ error: 'not found' }, 404);
  });
}
