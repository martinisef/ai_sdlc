import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { useT } from '../i18n';

type Json = Record<string, any>;

interface ConfigResponse {
  path: string;
  legacy: boolean;
  config: Json | null;
  issues: string[];
}

const AGENTS = [
  ['claude', 'Claude Code'],
  ['cursor', 'Cursor'],
  ['agents-md', 'AGENTS.md (Codex, Copilot, …)'],
] as const;

const get = (o: Json, path: string) => path.split('.').reduce<any>((acc, k) => acc?.[k], o);
function set(o: Json, path: string, value: unknown): Json {
  const keys = path.split('.');
  const out = structuredClone(o);
  let cur = out;
  for (const k of keys.slice(0, -1)) cur = cur[k] ??= {};
  if (value === undefined || value === '') delete cur[keys.at(-1)!];
  else cur[keys.at(-1)!] = value;
  return out;
}

function Text({ cfg, path, label, onChange, placeholder }: { cfg: Json; path: string; label: string; onChange: (c: Json) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={get(cfg, path) ?? ''} placeholder={placeholder} onChange={(e) => onChange(set(cfg, path, e.target.value || undefined))} />
    </label>
  );
}

function Select({ cfg, path, label, options, onChange }: { cfg: Json; path: string; label: string; options: string[]; onChange: (c: Json) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={get(cfg, path) ?? ''} onChange={(e) => onChange(set(cfg, path, e.target.value || undefined))}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function List({ cfg, path, label, onChange }: { cfg: Json; path: string; label: string; onChange: (c: Json) => void }) {
  const t = useT();
  const value: string[] = get(cfg, path) ?? [];
  const [text, setText] = useState(value.join('\n'));
  useEffect(() => setText(value.join('\n')), [JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="field">
      <span>
        {label} <em className="muted">({t('one per line')})</em>
      </span>
      <textarea
        rows={Math.max(2, value.length + 1)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(set(cfg, path, text.split('\n').map((s) => s.trim()).filter(Boolean)))}
      />
    </label>
  );
}

/** Role → emails, edited as "role: a@x, b@y" lines. */
function Roles({ cfg, onChange }: { cfg: Json; onChange: (c: Json) => void }) {
  const toText = (r: Json = {}) => Object.entries(r).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('\n');
  const [text, setText] = useState(toText(cfg.roles));
  useEffect(() => setText(toText(cfg.roles)), [JSON.stringify(cfg.roles)]); // eslint-disable-line react-hooks/exhaustive-deps
  const parse = () =>
    Object.fromEntries(
      text
        .split('\n')
        .map((l) => l.split(':'))
        .filter(([k, v]) => k?.trim() && v !== undefined)
        .map(([k, v]) => [k.trim(), v.split(',').map((s) => s.trim()).filter(Boolean)]),
    );
  return (
    <label className="field">
      <span>Roles <em className="muted">(role: email, email)</em></span>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(set(cfg, 'roles', parse()))} placeholder="po: ana@acme.com&#10;tech-lead: juan@acme.com" />
    </label>
  );
}

function Gates({ cfg, onChange }: { cfg: Json; onChange: (c: Json) => void }) {
  return (
    <div className="row3">
      {(['intent', 'spec', 'plan'] as const).map((a) => (
        <label key={a} className="field">
          <span>{a}.md — roles</span>
          <input
            value={(cfg.gates?.[a] ?? []).join(', ')}
            onChange={(e) => onChange(set(cfg, `gates.${a}`, e.target.value.split(',').map((s) => s.trim()).filter(Boolean)))}
          />
        </label>
      ))}
    </div>
  );
}

export function Settings() {
  const t = useT();
  const { data, reload } = useApi<ConfigResponse>('/config');
  const [cfg, setCfg] = useState<Json>();
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [preview, setPreview] = useState<{ before: string; after: string }>();
  const [issues, setIssues] = useState<string[]>([]);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    if (data?.config && !cfg) {
      setCfg(data.config);
      setRaw(JSON.stringify(data.config, null, 2));
    }
  }, [data, cfg]);
  if (!data || !cfg) return <div className="empty">…</div>;

  const change = (c: Json) => {
    setCfg(c);
    setRaw(JSON.stringify(c, null, 2));
    setPreview(undefined);
  };
  const current = (): Json | undefined => {
    if (mode === 'form') return cfg;
    try {
      return JSON.parse(raw);
    } catch (e) {
      setIssues([`JSON: ${(e as Error).message}`]);
      return undefined;
    }
  };
  const submit = async (dryRun: boolean) => {
    const config = current();
    if (!config) return;
    setMsg(undefined);
    try {
      const r = await api<{ before: string; after: string; sync?: { written: string[] } }>('/config', { method: 'PUT', body: JSON.stringify({ config, dryRun }) });
      setIssues([]);
      if (dryRun) setPreview(r);
      else {
        setPreview(undefined);
        setMsg(`${t('Saved and synced')} — ${r.sync?.written.length ?? 0} files`);
        setCfg(undefined);
        reload();
      }
    } catch (e) {
      setIssues((e as { body?: { issues?: string[] } }).body?.issues ?? [(e as Error).message]);
    }
  };
  const agents: string[] = cfg.agents ?? [];

  return (
    <div className="settings">
      <div className="settings-head">
        <h2>
          <code>{data.path}</code>
        </h2>
        <div className="tabs">
          <button className={mode === 'form' ? 'on' : ''} onClick={() => setMode('form')}>
            {t('Form')}
          </button>
          <button className={mode === 'json' ? 'on' : ''} onClick={() => setMode('json')}>
            {t('Raw JSON')}
          </button>
        </div>
      </div>
      {data.legacy && <p className="warn-box">Legacy location. Run <code>sdlc migrate</code> to move it to .sdlc/config.json.</p>}

      {mode === 'json' ? (
        <textarea className="json" spellCheck={false} value={raw} onChange={(e) => setRaw(e.target.value)} rows={30} />
      ) : (
        <div className="form">
          <section className="panel">
            <h3>Agents</h3>
            <div className="checks-row">
              {AGENTS.map(([id, label]) => (
                <label key={id} className="check">
                  <input
                    type="checkbox"
                    checked={agents.includes(id)}
                    onChange={(e) => change(set(cfg, 'agents', e.target.checked ? [...agents, id] : agents.filter((a) => a !== id)))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="row3">
              <Select cfg={cfg} path="locale" label="Locale" options={['en', 'es']} onChange={change} />
            </div>
          </section>
          <section className="panel">
            <h3>Repository</h3>
            <div className="row3">
              <Select cfg={cfg} path="vcs.provider" label="Provider" options={['github', 'gitlab', 'bitbucket']} onChange={change} />
              <Text cfg={cfg} path="vcs.default_branch" label="Default branch" onChange={change} placeholder="main" />
              <Text cfg={cfg} path="vcs.host" label="Host" onChange={change} />
            </div>
          </section>
          <section className="panel">
            <h3>Commands (feedback loop)</h3>
            <div className="row3">
              {['build', 'test', 'lint', 'format', 'run'].map((k) => (
                <Text key={k} cfg={cfg} path={`commands.${k}`} label={k} onChange={change} />
              ))}
            </div>
          </section>
          <section className="panel">
            <h3>Guardrails</h3>
            <div className="row2">
              <List cfg={cfg} path="protected_paths" label="Protected paths" onChange={change} />
              <List cfg={cfg} path="test_globs" label="Test globs (test-lock)" onChange={change} />
              <List cfg={cfg} path="risk.high_risk_paths" label="High-risk paths" onChange={change} />
              <List cfg={cfg} path="secret_patterns_extra" label="Extra secret patterns (ERE)" onChange={change} />
              <List cfg={cfg} path="production_gate.patterns" label="Production gate patterns (ERE)" onChange={change} />
              <Text cfg={cfg} path="production_gate.approval_env" label="Approval env var" onChange={change} placeholder="RELEASE_APPROVAL" />
            </div>
          </section>
          <section className="panel">
            <h3>Gates</h3>
            <Gates cfg={cfg} onChange={change} />
            <Roles cfg={cfg} onChange={change} />
          </section>
          <section className="panel">
            <h3>Tracker</h3>
            <div className="row3">
              <Select cfg={cfg} path="tracker.provider" label="Provider" options={['jira', 'none']} onChange={change} />
              <Select cfg={cfg} path="tracker.mode" label="Mode" options={['linkage', 'jira-sot', 'repo-sot']} onChange={change} />
              <Text cfg={cfg} path="tracker.base_url" label="Base URL" onChange={change} />
              <Text cfg={cfg} path="tracker.project_key" label="Project key" onChange={change} />
            </div>
          </section>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {preview && <Diff before={preview.before} after={preview.after} />}
      <div className="actions sticky">
        <button onClick={() => submit(true)}>{t('Preview changes')}</button>
        <button className="primary" disabled={!preview} onClick={() => submit(false)}>
          {t('Save')}
        </button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </div>
  );
}

/** Line diff (LCS) — configs are small. */
function Diff({ before, after }: { before: string; after: string }) {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: [string, string][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) out.push([' ', a[i++]]), j++;
    else if (i < a.length && (j === b.length || dp[i + 1][j] >= dp[i][j + 1])) out.push(['-', a[i++]]);
    else out.push(['+', b[j++]]);
  }
  if (out.every(([k]) => k === ' ')) return <p className="muted">No changes.</p>;
  return (
    <pre className="diff">
      {out.map(([k, l], n) => (
        <div key={n} className={k === '+' ? 'add' : k === '-' ? 'del' : ''}>
          {k} {l}
        </div>
      ))}
    </pre>
  );
}
