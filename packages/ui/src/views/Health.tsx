import { useState } from 'react';
import { api, useApi, type Doctor } from '../api';
import { useT } from '../i18n';

const LEGEND: Record<string, string> = {
  blocks: 'stopped before it happens',
  commit: 'git pre-commit',
  push: 'git pre-push',
  'post-hoc': 'after the fact, reported to the agent',
  ci: 'CI / environment',
  advisory: 'instructions only',
};

export function Health() {
  const t = useT();
  const { data, reload } = useApi<Doctor>('/doctor');
  const [path, setPath] = useState('');
  const [msg, setMsg] = useState<string>();
  if (!data) return <div className="empty">…</div>;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="health">
      <section className="panel">
        <h3>{t('Checks')}</h3>
        <ul className="checks">
          {data.checks.map((c) => (
            <li key={c.id} className={c.ok ? 'ok' : c.level}>
              <span className="mark">{c.ok ? '✓' : c.level === 'warn' ? '!' : '✗'}</span> {c.message}
            </li>
          ))}
        </ul>
        <div className="actions">
          <button onClick={() => run(() => api('/sync', { method: 'POST', body: '{}' }), 'synced')}>{t('Sync')}</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </section>
      {data.agents.length > 0 && (
        <section className="panel">
          <h3>{t('Enforcement')}</h3>
          <table className="table">
            <thead>
              <tr>
                <th>guardrail</th>
                {data.agents.map((a) => (
                  <th key={a}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.matrix.map((row) => (
                <tr key={row.guardrail}>
                  <td>
                    <code>{row.guardrail}</code>
                  </td>
                  {data.agents.map((a) => (
                    <td key={a}>
                      {row[a].map((e) => (
                        <span key={e} className={`pill enf-${e}`} title={LEGEND[e]}>
                          {e}
                        </span>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{Object.entries(LEGEND).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
        </section>
      )}
      <section className="panel">
        <h3>{t('Add workspace')}</h3>
        <div className="actions">
          <input placeholder="/path/to/repo" value={path} onChange={(e) => setPath(e.target.value)} />
          <button onClick={() => run(() => api('/workspaces', { method: 'POST', body: JSON.stringify({ path }) }), 'added — reload to switch')}>+</button>
        </div>
      </section>
    </div>
  );
}
