import { useApi, type SdlcEvent } from '../api';
import { useT } from '../i18n';

const KIND: Record<string, string> = {
  'guardrail.block': 'bad',
  'guardrail.warn': 'wait',
  'guardrail.override': 'wait',
  'gate.approve': 'ok',
  'gate.reject': 'bad',
  'band.break': 'bad',
};

export function Activity() {
  const t = useT();
  const { data } = useApi<SdlcEvent[]>('/events');
  if (!data) return <div className="empty">…</div>;
  if (!data.length) return <div className="empty">{t('No activity yet')}</div>;
  return (
    <table className="table activity">
      <tbody>
        {data.map((e, i) => (
          <tr key={i}>
            <td className="muted nowrap">{new Date(e.ts).toLocaleString()}</td>
            <td>
              <span className={`pill ${KIND[e.type] ?? 'none'}`}>{e.type}</span>
            </td>
            <td className="nowrap">{[e.agent, e.policy, e.metric, e.change && (e.artifact ? `${e.change}/${e.artifact}.md` : e.change), e.by].filter(Boolean).join(' · ')}</td>
            <td>{e.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
