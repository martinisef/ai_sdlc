import { useApi, type Metrics } from '../api';
import { useT } from '../i18n';

const fmtH = (h?: number) => (h === undefined ? '—' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);

function Bars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="muted">—</p>;
  return (
    <div className="bars">
      {entries.map(([k, v]) => (
        <div key={k} className="bar-row">
          <span className="bar-label">{k}</span>
          <span className="bar" style={{ width: `${(v / max) * 100}%` }} />
          <span className="bar-value">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function MetricsView() {
  const t = useT();
  const { data } = useApi<Metrics>('/metrics');
  if (!data) return <div className="empty">…</div>;
  const s = data.summary;
  return (
    <div className="metrics">
      <div className="tiles">
        <div className="tile">
          <div className="tile-label">{t('Median intent → spec')}</div>
          <div className="tile-value">{fmtH(s.medianIntentToSpecH)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">{t('Median spec → plan')}</div>
          <div className="tile-value">{fmtH(s.medianSpecToPlanH)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">{t('Spec rework after plan')}</div>
          <div className="tile-value">{s.specReworkRate === undefined ? '—' : `${Math.round(s.specReworkRate * 100)}%`}</div>
        </div>
        <div className="tile">
          <div className="tile-label">{t('Gate decisions')}</div>
          <div className="tile-value">{s.gateDecisions}</div>
        </div>
      </div>
      <div className="grid2">
        <section className="panel">
          <h3>{t('Changes by stage')}</h3>
          <Bars data={s.byStage} />
        </section>
        <section className="panel">
          <h3>{t('Changes by origin')}</h3>
          <Bars data={s.byOrigin} />
        </section>
        <section className="panel">
          <h3>{t('Guardrail blocks')}</h3>
          <Bars data={s.guardrailBlocks} />
        </section>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{t('Change')}</th>
            <th>stage</th>
            <th>intent → spec</th>
            <th>spec → plan</th>
            <th>spec rework</th>
          </tr>
        </thead>
        <tbody>
          {data.changes.map((c) => (
            <tr key={c.change}>
              <td>
                <a href={`#/change/${encodeURIComponent(c.change.replace(/^changes\//, ''))}`}>{c.change}</a>
              </td>
              <td>{c.stage}</td>
              <td className="num">{fmtH(c.intentToSpecH)}</td>
              <td className="num">{fmtH(c.specToPlanH)}</td>
              <td className="num">{c.specReworkAfterPlan ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
