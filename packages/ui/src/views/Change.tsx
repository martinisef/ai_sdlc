import { Marked } from 'marked';
import { useMemo, useState } from 'react';
import { api, useApi, type Artifact, type ChangeDetail } from '../api';
import { useT } from '../i18n';
import { StatusPill } from './Board';

const ARTIFACTS: Artifact[] = ['intent', 'spec', 'plan'];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** http(s), mailto or relative; browsers ignore whitespace and control characters inside a scheme. */
const safeUrl = (href: string) => {
  const u = href.replace(/[\u0000-\u0020]/g, '');
  return /^(https?|mailto):/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u);
};

// Artifacts can come from any branch, including a contributor's pull request, and the page holds the API token:
// raw HTML is shown as text and only http(s), mailto and relative links are kept.
const md = new Marked({
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!safeUrl(href)) return label;
      return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''} rel="noreferrer">${label}</a>`;
    },
    image({ href, title, text }) {
      if (!safeUrl(href)) return escapeHtml(text);
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`;
    },
  },
});

/** Rendered artifact; "Areas of concern" sections are highlighted for the reviewer. */
export function renderMarkdown(text: string): string {
  return (md.parse(text, { async: false }) as string).replace(/<h2>(Areas? of concern|Áreas? de preocupación)([^<]*)<\/h2>/gi, '<h2 class="concern">$1$2</h2>');
}

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Gate({ change, artifact }: { change: ChangeDetail; artifact: Artifact }) {
  const t = useT();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const info = change.artifacts[artifact]!;
  const gate = change.gates[artifact];
  const decided = info.status === 'approved' || info.status === 'accepted' || info.status === 'rejected';
  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(true);
    setMsg(undefined);
    try {
      const r = await api<{ commit: string }>(`/changes/${encodeURIComponent(change.dir)}/gates/${artifact}`, {
        method: 'POST',
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      setMsg(`✓ ${decision} (${r.commit})`);
      setComment('');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (decided)
    return (
      <div className="gate done">
        <StatusPill status={info.status} />
        {info.data.approved_by && (
          <span className="muted">
            {info.data.approved_by} · {info.data.approved_at}
          </span>
        )}
      </div>
    );
  return (
    <div className="gate">
      {gate?.ok ? (
        <>
          <input placeholder={t('Comment (optional)')} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="primary" disabled={busy} onClick={() => decide('approved')}>
            {artifact === 'intent' ? t('Accept') : t('Approve')}
          </button>
          <button className="danger" disabled={busy} onClick={() => decide('rejected')}>
            {t('Reject')}
          </button>
        </>
      ) : (
        <span className="muted">
          {t('Not yours to approve')}: {gate?.reason}
        </span>
      )}
      {msg && <span className="gate-msg">{msg}</span>}
    </div>
  );
}

export function ChangeView({ dir }: { dir: string }) {
  const t = useT();
  const { data: c, error } = useApi<ChangeDetail>(`/changes/${encodeURIComponent(dir)}`);
  const present = ARTIFACTS.filter((a) => c?.artifacts[a]);
  const [tab, setTab] = useState<Artifact>();
  if (error) return <div className="empty error">{error}</div>;
  if (!c) return <div className="empty">…</div>;
  const current = tab && c.artifacts[tab] ? tab : (c.waitingFor ?? present[present.length - 1]);
  return (
    <div className="change">
      <a href="#/" className="back">
        ← {t('Board')}
      </a>
      <h1>{c.title ?? c.slug}</h1>
      <div className="card-meta">
        <code>{c.id}</code>
        {c.branch && <code>{c.branch}</code>}
        {c.ticket && <span className="tag">{c.ticket}</span>}
        {c.risk && <span className={`tag ${c.risk === 'high' ? 'risk' : ''}`}>risk: {c.risk}</span>}
        {c.origin && <span className={`tag ${c.origin === 'incident' ? 'incident' : ''}`}>{c.origin}</span>}
        {c.pr && (
          <a className={`tag pr ${c.pr.state}`} href={c.pr.url} target="_blank" rel="noreferrer">
            PR #{c.pr.number} {c.pr.state}
          </a>
        )}
      </div>
      <p className="next">
        <strong>{t('Next step')}:</strong> {c.next}
      </p>
      <div className="split">
        <section className="artifact">
          <div className="tabs">
            {present.map((a) => (
              <button key={a} className={a === current ? 'on' : ''} onClick={() => setTab(a)}>
                {a}.md <StatusPill status={c.artifacts[a]!.status} />
              </button>
            ))}
          </div>
          {current && (
            <>
              <Gate change={c} artifact={current} />
              <Markdown text={c.artifacts[current]!.body} />
            </>
          )}
        </section>
        <aside className="timeline">
          <h3>{t('Timeline')}</h3>
          <ol>
            {c.timeline.map((e) => (
              <li key={e.sha} className={e.agent ? 'agent' : ''}>
                <div>{e.subject}</div>
                <div className="muted">
                  <code>{e.sha}</code> · {e.author}
                  {e.agent && <span className="tag">{t('agent')}</span>} · {new Date(e.date).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
