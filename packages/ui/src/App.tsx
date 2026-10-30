import { useEffect, useState } from 'react';
import { api, setWorkspace, useApi, type State, type Workspace } from './api';
import { LangContext, useT } from './i18n';
import { Activity } from './views/Activity';
import { Board } from './views/Board';
import { ChangeView } from './views/Change';
import { Health } from './views/Health';
import { Inbox } from './views/Inbox';
import { MetricsView } from './views/Metrics';
import { Settings } from './views/Settings';

function useHash() {
  const [hash, setHash] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1) || '/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const NAV = [
  ['/', 'Board'],
  ['/inbox', 'Inbox'],
  ['/metrics', 'Metrics'],
  ['/activity', 'Activity'],
  ['/settings', 'Settings'],
  ['/health', 'Health'],
] as const;

function Shell({ state, workspaces, onWorkspace }: { state: State; workspaces: Workspace[]; onWorkspace: (p: string) => void }) {
  const t = useT();
  const route = useHash();
  const section = '/' + (route.split('/')[1] ?? '');
  let view;
  if (route.startsWith('/change/')) view = <ChangeView dir={decodeURIComponent(route.slice('/change/'.length))} />;
  else if (!state.configured && section !== '/health') view = <NotConfigured />;
  else if (section === '/inbox') view = <Inbox state={state} />;
  else if (section === '/metrics') view = <MetricsView />;
  else if (section === '/activity') view = <Activity />;
  else if (section === '/settings') view = <Settings />;
  else if (section === '/health') view = <Health />;
  else view = <Board />;

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
            <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="4" />
            <circle cx="27" cy="16" r="3" fill="currentColor" />
          </svg>
          <span>AI-native SDLC</span>
        </div>
        <select className="ws" value={state.root} onChange={(e) => onWorkspace(e.target.value)} aria-label="Workspace">
          {workspaces.map((w) => (
            <option key={w.path} value={w.path}>
              {w.name}
            </option>
          ))}
        </select>
        <nav>
          {NAV.map(([href, label]) => (
            <a key={href} href={`#${href}`} className={section === href || (href === '/' && section === '/change') ? 'on' : ''}>
              {t(label)}
            </a>
          ))}
        </nav>
        <div className="who" title={state.user.email}>
          {state.branch && <code>{state.branch}</code>}
          <span>{state.user.name ?? state.user.email ?? '?'}</span>
        </div>
      </header>
      <main>{view}</main>
    </div>
  );
}

function NotConfigured() {
  const t = useT();
  return (
    <div className="empty">
      <h2>{t('Not configured')}</h2>
      <p>
        {t('Run sdlc init in this repo')}: <code>npx @ai-native-sdlc/cli init</code>
      </p>
    </div>
  );
}

export function App() {
  const [ws, setWs] = useState('');
  const { data: workspaces } = useApi<Workspace[]>('/workspaces');
  const { data: state, error, reload } = useApi<State>('/state');
  const pick = (p: string) => {
    setWorkspace(p);
    setWs(p);
    location.hash = '/';
  };
  useEffect(() => reload(), [ws, reload]);
  if (error) return <div className="empty error">{error}</div>;
  if (!state || !workspaces) return <div className="empty">…</div>;
  return (
    <LangContext.Provider value={state.locale}>
      <Shell state={state} workspaces={workspaces} onWorkspace={pick} />
    </LangContext.Provider>
  );
}

export { api };
