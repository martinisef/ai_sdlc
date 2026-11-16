import { useState, type FormEvent } from 'react';
import { api, upload, useApi, type DiscoveryItem, type DiscoveryState, type SeedResult } from '../api';
import { plural, useT } from '../i18n';
import { AgentNote, JobPanel } from './Roadmaps';

const ACCEPT = '.pdf,.md,.markdown,.txt,.vtt,.srt';
const TYPES = ['client', 'review', 'daily', 'internal', 'other'];
const label = (key?: string) => (key ?? '').replace(/_/g, ' ').replace('unverified', 'not verified');

function Feature({ it }: { it: DiscoveryItem }) {
  const t = useT();
  return (
    <li>
      <span>
        <code>{it.ref}</code> {it.text}
        {it.blockedBy?.length ? (
          <span className="muted small">
            {' '}
            — {t('blocked by')} {it.blockedBy.join(', ')}
          </span>
        ) : null}
      </span>
      <span className="muted small">
        <span className={`pill ${it.status === 'reimplement' ? 'wait' : ''}`}>{t(label(it.status))}</span>
        {it.repo && <span className="pill">{t(label(it.repo))}</span>}
        {it.tickets?.map((k) => (
          <span key={k} className="tag pr open">
            {k}
          </span>
        ))}
      </span>
    </li>
  );
}

function AddMeeting({ busy }: { busy: boolean }) {
  const t = useT();
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string>();
  const send = async (el: HTMLFormElement, force = false): Promise<void> => {
    const form = new FormData(el);
    if (force) form.set('force', 'true');
    setSending(true);
    setMsg(undefined);
    try {
      await upload('/discovery/sources', form);
      el.reset();
    } catch (err) {
      const body = (err as { body?: { olderThan?: string } }).body;
      if (body?.olderThan && !force && confirm(`${(err as Error).message}?`)) return send(el, true);
      setMsg((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send(e.currentTarget);
  };
  return (
    <form className="panel form" onSubmit={submit}>
      <h3>{t('Add a meeting')}</h3>
      <p className="muted small">{t('Upload the transcript or the minutes: the agent merges what was asked, agreed and left open into the project state, checking it against the tracker, the code and the branches in flight. It never writes to the tracker.')}</p>
      <AgentNote />
      <div className="row2">
        <label className="field">
          {t('Transcript (PDF, Markdown, text, VTT or SRT, up to 20 MB)')}
          <input name="file" type="file" accept={ACCEPT} required />
        </label>
        <label className="field">
          {t('Meeting name')}
          <input name="name" required placeholder="Weekly sync" />
        </label>
      </div>
      <div className="row2">
        <label className="field">
          {t('Date (if the file name has none)')}
          <input name="date" type="date" />
        </label>
        <label className="field">
          {t('Type')}
          <select name="type" defaultValue="client">
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(x)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="actions">
        <button className="primary" disabled={sending || busy}>
          {t('Upload and process')}
        </button>
        {msg && <span className="issues">{msg}</span>}
      </div>
    </form>
  );
}

function Seed() {
  const t = useT();
  const [msg, setMsg] = useState<string>();
  const run = async () => {
    try {
      const r = await api<SeedResult>('/discovery/seed', { method: 'POST', body: '{}' });
      setMsg(`${r.path}: ${r.added.length} ${t('added')}, ${r.updated.length} ${t('updated')}${r.warnings.length ? ` · ${r.warnings.join(' · ')}` : ''}`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <section className="panel">
      <h3>{t('Baseline')}</h3>
      <p className="muted small">{t('For a project that started before its meetings were tracked: one row per tracker issue, change, roadmap story and unmerged branch, so nothing already built is requested again.')}</p>
      <div className="actions">
        <button onClick={run}>{t('Seed from the tracker and git')}</button>
        {msg && <span className="gate-msg">{msg}</span>}
      </div>
    </section>
  );
}

export function Discovery() {
  const t = useT();
  const { data, error } = useApi<DiscoveryState>('/discovery');
  if (error) return <div className="empty error">{error}</div>;
  if (!data) return <div className="empty">…</div>;
  const s = data.status;
  const running = data.job?.status === 'running';
  const baseline = Object.values(s.baseline).reduce((a, b) => a + b, 0);
  return (
    <div className="roadmaps discovery">
      <h2>
        {t('Discovery')} <span className="pill">{t('experimental')}</span>
      </h2>
      {data.job && <JobPanel job={data.job} />}
      {data.started && (
        <p className="muted">
          {t('Last meeting')}: <strong>{s.lastSource ?? '—'}</strong> · {plural(t, s.sources, 'meeting', 'meetings')} · <code>{data.dir}</code>
        </p>
      )}
      {data.errors.length > 0 && (
        <ul className="issues small">
          {data.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {data.started ? (
        <>
          <section className="panel">
            <h3>{t('To do')}</h3>
            {s.todo.length ? (
              s.topics.map((tp) => {
                const items = s.todo.filter((i) => i.topic === tp.slug);
                return items.length ? (
                  <div key={tp.slug}>
                    <h4>{tp.title}</h4>
                    <ul className="list">
                      {items.map((it) => (
                        <Feature key={it.ref} it={it} />
                      ))}
                    </ul>
                  </div>
                ) : null;
              })
            ) : (
              <p className="muted">{t('Nothing pending')}</p>
            )}
            {s.outOfScope.length > 0 && (
              <p className="muted small">
                {t('Out of scope')}: {s.outOfScope.map((i) => i.ref).join(', ')}
              </p>
            )}
          </section>
          <section className="panel">
            <h3>{t('Open questions')}</h3>
            {s.questions.length ? (
              <ul className="list">
                {s.questions.map((q) => (
                  <li key={q.ref}>
                    <span>
                      <code>{q.ref}</code> {q.status === 'contradiction' && <span className="pill bad">{t('contradiction')}</span>} {q.text}
                    </span>
                    <span className="muted small">
                      {q.to} · {q.since}
                      {(q.silentFor ?? 0) >= 2 && <span className="pill wait">{plural(t, q.silentFor!, 'meeting without news', 'meetings without news')}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('Nothing pending')}</p>
            )}
          </section>
          <div className="row2">
            <section className="panel">
              <h3>{t('Open action items')}</h3>
              <ul className="list">
                {s.actions.map((a) => (
                  <li key={a.ref}>
                    <span>
                      <code>{a.ref}</code> {a.text}
                    </span>
                    <span className="muted small">
                      {a.owner} · {t(label(a.status))}
                    </span>
                  </li>
                ))}
              </ul>
              {!s.actions.length && <p className="muted">{t('Nothing pending')}</p>}
            </section>
            <section className="panel">
              <h3>{t('Active risks')}</h3>
              <ul className="list">
                {s.risks.map((r) => (
                  <li key={r.ref}>
                    <span>
                      <code>{r.ref}</code> {r.text}
                    </span>
                  </li>
                ))}
              </ul>
              {!s.risks.length && <p className="muted">{t('Nothing pending')}</p>}
            </section>
          </div>
          {data.followup && (
            <section className="panel">
              <h3>{t('Follow-up draft')}</h3>
              <p className="muted small">
                <code>{data.followup.path}</code> · {t('nothing is sent from here')}
              </p>
              <pre className="log">{data.followup.body}</pre>
            </section>
          )}
          <section className="panel">
            <h3>{t('Done')}</h3>
            <ul className="list">
              {s.done.map((it) => (
                <Feature key={it.ref} it={it} />
              ))}
            </ul>
            {!s.done.length && <p className="muted">—</p>}
            {baseline > 0 && <p className="muted small">{plural(t, baseline, 'feature in the baseline', 'features in the baseline')}</p>}
          </section>
          <section className="panel">
            <h3>{t('Meetings')}</h3>
            <ul className="list small">
              {data.sources.map((m) => (
                <li key={m.label}>
                  <span>{m.label}</span>
                  <span className="muted">{t(m.type)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="muted">{t('No meetings yet: upload the first transcript, or seed the baseline first if the project already has code or tickets.')}</p>
      )}
      <AddMeeting busy={running} />
      <Seed />
    </div>
  );
}
