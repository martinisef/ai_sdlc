import { useApi, type ChangeSummary, type Column } from '../api';
import { useT } from '../i18n';

const COLUMNS: [Column, string][] = [
  ['intent', 'Intent'],
  ['spec', 'Spec'],
  ['plan', 'Plan'],
  ['build', 'Build'],
  ['review', 'Review'],
  ['merged', 'Merged'],
];

export function StatusPill({ status }: { status?: string }) {
  const s = status ?? '-';
  const kind = s === 'approved' || s === 'accepted' ? 'ok' : s === 'rejected' ? 'bad' : s === '-' ? 'none' : 'wait';
  return <span className={`pill ${kind}`}>{s}</span>;
}

function Card({ c }: { c: ChangeSummary }) {
  const t = useT();
  return (
    <a className={`card${c.active ? ' active' : ''}`} href={`#/change/${encodeURIComponent(c.dir)}`}>
      <div className="card-title">{c.title ?? c.slug}</div>
      <div className="card-meta">
        <code>{c.slug}</code>
        {c.ticket && <span className="tag">{c.ticket}</span>}
        {c.origin === 'incident' && <span className="tag incident">incident</span>}
        {c.risk === 'high' && <span className="tag risk">risk: high</span>}
      </div>
      <div className="card-foot">
        {c.waitingFor ? (
          <span className="wait">
            {t('waiting for')} {c.waitingFor} gate
          </span>
        ) : (
          <span className="muted">{c.stage}</span>
        )}
        {c.pr && (
          <span className={`tag pr ${c.pr.state}`}>
            #{c.pr.number} {c.pr.state}
          </span>
        )}
      </div>
    </a>
  );
}

export function Board() {
  const t = useT();
  const { data, error } = useApi<ChangeSummary[]>('/changes', { pr: '1' });
  if (error) return <div className="empty error">{error}</div>;
  if (!data) return <div className="empty">…</div>;
  if (!data.length)
    return (
      <div className="empty">
        <h2>{t('No changes yet')}</h2>
        <p>
          {t('Start one with')} <code>/sdlc-intent</code> · <code>sdlc new &lt;slug&gt;</code>
        </p>
      </div>
    );
  const rejected = data.filter((c) => c.column === 'rejected');
  return (
    <>
      <div className="board">
        {COLUMNS.map(([col, label]) => {
          const items = data.filter((c) => c.column === col);
          return (
            <section key={col} className="col">
              <h3>
                {t(label)} <span className="count">{items.length}</span>
              </h3>
              {items.map((c) => (
                <Card key={c.id} c={c} />
              ))}
            </section>
          );
        })}
      </div>
      {rejected.length > 0 && (
        <details className="rejected">
          <summary>
            {t('Rejected')} ({rejected.length})
          </summary>
          <div className="row-cards">
            {rejected.map((c) => (
              <Card key={c.id} c={c} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}
