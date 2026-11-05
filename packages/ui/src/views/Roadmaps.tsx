import { useState, type FormEvent } from 'react';
import { api, upload, useApi, type AgentInfo, type ApplyResult, type Job, type RoadmapDetail, type RoadmapNode, type RoadmapSummary } from '../api';
import { plural, useT } from '../i18n';
import { StatusPill } from './Board';

const ACCEPT = '.pdf,.md,.markdown,.txt';
const AGENT_NAME: Record<AgentInfo['agent'], string> = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor' };

/** Which CLI runs the dashboard's jobs on this machine. */
function AgentNote() {
  const t = useT();
  const { data } = useApi<AgentInfo>('/agent');
  if (!data) return null;
  return data.installed ? (
    <p className="muted small agent-note">
      {t('The agent:')} <strong>{AGENT_NAME[data.agent]}</strong> (<code>{data.bin}</code>)
    </p>
  ) : (
    <p className="issues small agent-note">
      {t('No agent CLI found on this machine: install Claude Code, the Cursor CLI or Codex, or set ci.agent in .sdlc/config.json.')}
    </p>
  );
}

/** The agent's run on a roadmap: what it is doing, or why it stopped. */
function JobPanel({ job }: { job: Job }) {
  const t = useT();
  if (job.status === 'done') return null;
  return (
    <div className={`job ${job.status}`}>
      <strong>
        {job.status === 'running'
          ? t(job.kind === 'draft' ? 'The agent is drafting the breakdown…' : 'The agent is updating the breakdown with your answers…')
          : t('The agent stopped')}
      </strong>{' '}
      <span className="muted small">({AGENT_NAME[job.agent as AgentInfo['agent']] ?? job.agent})</span>
      {job.error && <div>{job.error}</div>}
      {job.log && <pre className="log">{job.log}</pre>}
    </div>
  );
}

function NewRoadmap() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!(form.get('file') as File | null)?.size) form.delete('file');
    setBusy(true);
    setError(undefined);
    try {
      const r = await upload<{ slug: string }>('/roadmaps', form);
      location.hash = `/roadmap/${encodeURIComponent(r.slug)}`;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel form new-roadmap" onSubmit={submit}>
      <h3>{t('New roadmap')}</h3>
      <p className="muted small">{t('Upload a technical plan: the agent breaks it into epics and stories, asks what is unclear, and nothing reaches the tracker until a person approves it.')}</p>
      <AgentNote />
      <div className="row2">
        <label className="field">
          {t('Name (lowercase letters, digits and dashes)')}
          <input name="slug" required pattern="[a-z0-9][a-z0-9\-]*" placeholder="todo-sharing" />
        </label>
        <label className="field">
          {t('Title (optional)')}
          <input name="title" />
        </label>
      </div>
      <div className="row2">
        <label className="field">
          {t('Technical plan (PDF, Markdown or text, up to 20 MB)')}
          <input name="file" type="file" accept={ACCEPT} />
        </label>
        <label className="field">
          {t('…or a link to it (Google Doc)')}
          <input name="url" type="url" placeholder="https://docs.google.com/document/d/…" />
        </label>
      </div>
      <div className="actions">
        <button className="primary" disabled={busy}>
          {t('Upload and draft')}
        </button>
        {error && <span className="issues">{error}</span>}
      </div>
    </form>
  );
}

export function Roadmaps() {
  const t = useT();
  const { data, error } = useApi<RoadmapSummary[]>('/roadmaps');
  if (error) return <div className="empty error">{error}</div>;
  if (!data) return <div className="empty">…</div>;
  return (
    <div className="roadmaps">
      <h2>{t('Roadmaps')}</h2>
      {data.length > 0 ? (
        <ul className="list">
          {data.map((r) => (
            <li key={r.slug}>
              <a href={`#/roadmap/${encodeURIComponent(r.slug)}`}>
                <strong>{r.title}</strong> <code>{r.slug}</code>
              </a>
              <span className="muted">
                {r.job?.status === 'running' && <span className="pill wait">{t('agent working')}</span>}
                <StatusPill status={r.status} /> {plural(t, r.epics, 'epic', 'epics')} · {plural(t, r.stories, 'story', 'stories')} · {r.tickets}/{r.items} {t('tickets')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('No roadmaps yet')}</p>
      )}
      <NewRoadmap />
    </div>
  );
}

function Questions({ r }: { r: RoadmapDetail }) {
  const t = useT();
  // only what the person typed: a reload while the agent works must not wipe it
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const send = async () => {
    setBusy(true);
    setMsg(undefined);
    try {
      const res = await api<{ changed: boolean }>(`/roadmaps/${encodeURIComponent(r.slug)}/answers`, { method: 'POST', body: JSON.stringify({ answers: edits }) });
      setEdits({});
      setMsg(res.changed ? t('Answers saved; the agent is updating the breakdown') : t('Nothing changed'));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel questions">
      <h3>{t('Open questions')}</h3>
      <div className="form">
        {r.questions.map((q) => (
          <label key={q.id} className="field">
            <span>
              <strong>{q.id}</strong> {q.text}
            </span>
            <textarea rows={2} value={edits[q.id] ?? q.answer ?? ''} onChange={(e) => setEdits({ ...edits, [q.id]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="actions">
        <button className="primary" disabled={busy || r.job?.status === 'running'} onClick={send}>
          {t('Send answers')}
        </button>
        {msg && <span className="gate-msg">{msg}</span>}
      </div>
    </section>
  );
}

function Story({ s }: { s: RoadmapNode }) {
  const t = useT();
  return (
    <li className="story">
      <div className="card-meta">
        <code>{s.id}</code>
        <strong>{s.title}</strong>
        {s.fields.risk && <span className={`tag ${s.fields.risk === 'high' ? 'risk' : ''}`}>risk: {s.fields.risk}</span>}
        {s.depends.length > 0 && (
          <span className="tag">
            {t('after')} {s.depends.join(', ')}
          </span>
        )}
        {s.fields.source && <span className="muted small">{s.fields.source}</span>}
        {s.fields.key && <span className="tag pr open">{s.fields.key}</span>}
      </div>
      {s.description && <p className="small">{s.description}</p>}
      {s.criteria.length > 0 && (
        <ul className="criteria small">
          {s.criteria.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Tree({ r }: { r: RoadmapDetail }) {
  const epics = r.tree.filter((i) => i.kind === 'epic');
  return (
    <section className="panel tree">
      {epics.map((e) => (
        <div key={e.id} className="epic">
          <h2>
            <code>{e.id}</code> {e.title} {e.fields.key && <span className="tag pr open">{e.fields.key}</span>}
          </h2>
          {e.description && <p className="muted small">{e.description}</p>}
          <ul className="stories">
            {r.tree
              .filter((s) => s.kind === 'story' && s.epic === e.id)
              .map((s) => (
                <Story key={s.id} s={s} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function RoadmapGate({ r }: { r: RoadmapDetail }) {
  const t = useT();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(true);
    setMsg(undefined);
    try {
      const res = await api<{ commit: string }>(`/roadmaps/${encodeURIComponent(r.slug)}/gate`, { method: 'POST', body: JSON.stringify({ decision, comment: comment || undefined }) });
      setMsg(`✓ ${decision} (${res.commit})`);
      setComment('');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (r.status === 'approved' && r.holds.ok)
    return (
      <div className="gate done">
        <StatusPill status={r.status} />
        <span className="muted">
          {r.data.approved_by} · {r.data.approved_at}
        </span>
      </div>
    );
  return (
    <div className="gate">
      {r.status === 'approved' && <span className="warn-box">{r.holds.reason}</span>}
      {r.canDecide.ok ? (
        <>
          <input placeholder={t('Comment (optional)')} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="primary" disabled={busy || r.errors.length > 0 || r.job?.status === 'running'} onClick={() => decide('approved')}>
            {t('Approve')}
          </button>
          <button className="danger" disabled={busy || r.job?.status === 'running'} onClick={() => decide('rejected')}>
            {t('Reject')}
          </button>
        </>
      ) : (
        <span className="muted">
          {t('Not yours to approve')}: {r.canDecide.reason}
        </span>
      )}
      {msg && <span className="gate-msg">{msg}</span>}
    </div>
  );
}

function Tickets({ r }: { r: RoadmapDetail }) {
  const t = useT();
  const [preview, setPreview] = useState<ApplyResult>();
  const [done, setDone] = useState<ApplyResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<ApplyResult>(`/roadmaps/${encodeURIComponent(r.slug)}/apply`, { method: 'POST', body: JSON.stringify({ dryRun }) });
      if (dryRun) setPreview(res);
      else {
        setDone(res);
        setPreview(undefined);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const label = (a: ApplyResult['actions'][number]) => (a.kind === 'link' ? a.summary : `${a.kind === 'create-epic' ? 'epic' : 'story'} ${a.id} ${a.summary}`);
  return (
    <section className="panel tickets">
      <h3>{t('Tickets')}</h3>
      {r.tickets === r.items && !done && <p className="muted">{t('Every epic and story has its ticket.')}</p>}
      {!r.tracker && <p className="warn-box">{t('No tracker connected: connect one in Settings → Tracker to create the tickets.')}</p>}
      <div className="actions">
        <button disabled={busy} onClick={() => run(true)}>
          {t('Preview tickets')}
        </button>
        {preview && preview.actions.length > 0 && (
          <button className="primary" disabled={busy || !r.tracker} onClick={() => run(false)}>
            {t('Create tickets')}
          </button>
        )}
        {error && <span className="issues">{error}</span>}
      </div>
      {preview && (
        <ul className="actions-list small">
          {preview.actions.length ? preview.actions.map((a, i) => <li key={i}>{label(a)}</li>) : <li className="muted">{t('Nothing to create')}</li>}
        </ul>
      )}
      {done && (
        <p className="gate-msg">
          ✓ {done.created} {t('tickets created')}, {done.linked} {t('links')}
        </p>
      )}
    </section>
  );
}

function Progress({ r }: { r: RoadmapDetail }) {
  const t = useT();
  if (!r.progress.some((s) => s.key)) return null;
  return (
    <section className="panel">
      <h3>{t('Stories')}</h3>
      <table className="table progress">
        <tbody>
          {r.progress.map((s) => (
            <tr key={s.id}>
              <td>
                <code>{s.id}</code>
              </td>
              <td>{s.key ?? '-'}</td>
              <td>{s.change ? <a href={`#/change/${encodeURIComponent(s.change)}`}>{s.stage}</a> : s.blockedBy.length ? `${t('blocked by')} ${s.blockedBy.join(', ')}` : s.key ? <code>/sdlc-intent {s.key}</code> : t('no ticket')}</td>
              <td>{s.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function RoadmapView({ slug }: { slug: string }) {
  const t = useT();
  const { data: r, error } = useApi<RoadmapDetail>(`/roadmaps/${encodeURIComponent(slug)}`);
  if (error) return <div className="empty error">{error}</div>;
  if (!r) return <div className="empty">…</div>;
  const problems = r.errors.filter((e) => !/ has no answer: /.test(e));
  return (
    <div className="change roadmap">
      <a href="#/roadmaps" className="back">
        ← {t('Roadmaps')}
      </a>
      <h1>{r.title}</h1>
      <div className="card-meta">
        <code>{r.path}</code>
        <StatusPill status={r.status} />
        <span>
          {plural(t, r.epics, 'epic', 'epics')} · {plural(t, r.stories, 'story', 'stories')}
        </span>
        {r.source && (/^https?:/.test(r.source) ? <a href={r.source} target="_blank" rel="noreferrer">{t('source document')}</a> : <code>{r.source}</code>)}
        {r.tracker && <span className="tag">{r.tracker}</span>}
      </div>
      {r.job && <JobPanel job={r.job} />}
      {r.questions.length > 0 && r.status !== 'approved' && <Questions r={r} />}
      {(problems.length > 0 || r.warnings.length > 0) && (
        <ul className="checks">
          {problems.map((e) => (
            <li key={e} className="error">
              <span className="mark">✗</span>
              {e}
            </li>
          ))}
          {r.warnings.map((w) => (
            <li key={w} className="warn">
              <span className="mark">!</span>
              {w}
            </li>
          ))}
        </ul>
      )}
      <RoadmapGate r={r} />
      {r.status === 'approved' && r.holds.ok && <Tickets r={r} />}
      <Progress r={r} />
      <Tree r={r} />
    </div>
  );
}
