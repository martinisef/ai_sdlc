import { useApi, type ChangeSummary, type RoadmapSummary, type State } from '../api';
import { plural, useT } from '../i18n';

/** Changes whose pending gate the current git user could decide (the server re-checks on submit). */
export function Inbox({ state }: { state: State }) {
  const t = useT();
  const { data } = useApi<ChangeSummary[]>('/changes');
  const { data: roadmaps } = useApi<RoadmapSummary[]>('/roadmaps');
  if (!data) return <div className="empty">…</div>;
  const ready = (roadmaps ?? []).filter((r) => r.status === 'draft' && !r.errors.length && r.job?.status !== 'running' && r.canDecide?.ok);
  const mine = data.filter((c) => c.waitingFor && c.canDecide?.ok);
  const waiting = mine.filter((c) => c.source === 'worktree');
  const elsewhere = mine.filter((c) => c.source !== 'worktree');
  return (
    <div className="inbox">
      <h2>{t('Inbox')}</h2>
      {!waiting.length && !elsewhere.length && !ready.length && <p className="muted">{t('Nothing waiting for you')}</p>}
      <ul className="list">
        {waiting.map((c) => (
          <li key={c.id}>
            <a href={`#/change/${encodeURIComponent(c.dir)}`}>
              <strong>{c.waitingFor}.md</strong> · {c.title ?? c.slug}
            </a>
            <span className="muted">{c.artifacts[c.waitingFor!]?.data.author ?? ''}</span>
          </li>
        ))}
        {ready.map((r) => (
          <li key={r.slug}>
            <a href={`#/roadmap/${encodeURIComponent(r.slug)}`}>
              <strong>roadmap.md</strong> · {r.title}
            </a>
            <span className="muted">
              {plural(t, r.epics, 'epic', 'epics')} · {plural(t, r.stories, 'story', 'stories')}
            </span>
          </li>
        ))}
      </ul>
      {elsewhere.length > 0 && (
        <>
          <h3>Other branches</h3>
          <p className="muted">
            Gates are commits: check out the branch to decide ({state.branch} is checked out).
          </p>
          <ul className="list">
            {elsewhere.map((c) => (
              <li key={c.id}>
                <a href={`#/change/${encodeURIComponent(c.dir)}`}>
                  <strong>{c.waitingFor}.md</strong> · {c.title ?? c.slug}
                </a>
                <code>git switch {typeof c.source === 'object' ? c.source.branch : ''}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
