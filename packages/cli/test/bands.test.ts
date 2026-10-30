// `sdlc bands check` end to end: sources (command, history, http-json, prometheus), tiers and the incident intent.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseFrontmatter } from '@ai-native-sdlc/core';
import { commitAll, project, sdlc } from './helpers.ts';

const SERIES = Array.from({ length: 20 }, (_, i) => (i % 2 ? 12 : 10));
const series = (...tail: number[]) => `printf '${[...SERIES, ...tail].join('\\n')}\\n'`;

function bands(root: string, yaml: string) {
  mkdirSync(join(root, 'ops'), { recursive: true });
  writeFileSync(join(root, 'ops/bands.yaml'), yaml);
  commitAll(root, 'bands');
}

function withRemote(root: string): string {
  const remote = join(mkdtempSync(join(tmpdir(), 'sdlc-remote-')), 'r.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
  execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: root });
  return remote;
}

const stubLog = () => join(mkdtempSync(join(tmpdir(), 'sdlc-stub-')), 'calls.log');

test('bands: no file → nothing to do; ok and insufficient bands', async () => {
  const root = project({});
  assert.match((await sdlc(root, ['bands', 'check'])).out, /No bands in ops\/bands.yaml/);
  bands(
    root,
    `bands:
  - metric: steady
    source: { command: "${series(11)}" }
    tiers: { 1sigma: { action: log } }
  - metric: young
    source: { command: "printf '1\\\\n2\\\\n'" }
    tiers: { 1sigma: { action: log } }
`,
  );
  const r = await sdlc(root, ['bands', 'check']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /steady .* ok/);
  assert.match(r.out, /young .* not enough data \(2 points\)/);
});

test('bands: 3σ propose opens an incident intent on its own branch, pushes it and a draft PR; no duplicates', async () => {
  const root = project({ vcs: { provider: 'github', default_branch: 'main' } });
  bands(
    root,
    `window: 30
bands:
  - metric: ci_test_failure_rate
    description: share of CI runs with failing tests
    source: { command: "${series(30)}" }
    direction: up
    tiers:
      1sigma: { action: log }
      2sigma: { action: diagnose, tools: "Read,Grep" }
      3sigma: { action: propose, tools: "Read,Grep,Bash(gh run view *)", routes: [pull_request, "runbook:rollback-deploy"] }
`,
  );
  const remote = withRemote(root);
  const log = stubLog();
  const r = await sdlc(root, ['bands', 'check'], { STUB_LOG: log });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /BROKEN 3σ \(1 point beyond 3σ\)/);
  assert.match(r.out, /3σ propose/);

  const calls = readFileSync(log, 'utf8');
  assert.match(calls, /claude -p Use the sdlc-incident skill in headless mode, diagnosis only/);
  assert.match(calls, /--allowedTools Read,Grep,Bash\(gh run view \*\)/);
  assert.match(calls, /gh pr create --title Incident: ci_test_failure_rate out of its control band .* --base main --head change\/incident-ci-test-failure-rate-\d{8} --draft/s);

  const branch = execFileSync('git', ['branch', '--format=%(refname:short)', '--list', 'change/incident-*'], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(branch, /^change\/incident-ci-test-failure-rate-\d{8}$/);
  assert.equal(execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), 'main', 'working tree untouched');
  const files = execFileSync('git', ['show', '--name-only', '--format=', branch], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(files, /^changes\/\d{4}-\d{2}-incident-ci-test-failure-rate-\d{8}\/intent\.md$/);
  const intent = execFileSync('git', ['show', `${branch}:${files}`], { cwd: root, encoding: 'utf8' });
  const fm = parseFrontmatter(intent).data;
  assert.deepEqual([fm.origin, fm.status, fm.author], ['incident', 'draft', 'sdlc bands']);
  assert.match(intent, /# Intent: ci_test_failure_rate out of its control band/);
  assert.match(intent, /Latest value: 30 \(baseline mean 10\.9\d+, σ 1\.0\d+, z 18\.\d+/);
  assert.match(intent, /### Automated diagnosis \(read-only\)\ndone; all tests pass/);
  assert.match(intent, /`ops\/runbooks\/rollback-deploy\.md`/);
  assert.match(intent, /## Problem/, 'the template sections stay for /sdlc-incident to fill');
  assert.ok(execFileSync('git', ['ls-remote', '--heads', remote, branch], { encoding: 'utf8' }).includes(branch), 'pushed');
  const events = readFileSync(join(root, '.sdlc/events.jsonl'), 'utf8');
  assert.match(events, /"type":"band.break","metric":"ci_test_failure_rate"/);

  const again = await sdlc(root, ['bands', 'check', '--no-agent'], { STUB_LOG: log });
  assert.match(again.out, /incident already open on change\/incident-ci-test-failure-rate-/);
});

test('bands: 2σ diagnose runs the agent read-only and writes nothing to git; --dry-run acts on nothing', async () => {
  const root = project({});
  bands(
    root,
    `bands:
  - metric: p95_latency_ms
    source: { command: "${series(13.4, 11, 13.4)}" }
    tiers:
      2sigma: { action: diagnose }
      3sigma: { action: propose }
`,
  );
  const log = stubLog();
  const dry = await sdlc(root, ['bands', 'check', '--dry-run', '--json'], { STUB_LOG: log });
  const parsed = JSON.parse(dry.out);
  assert.deepEqual([parsed.results[0].level, parsed.actions[0].action, parsed.actions[0].diagnosis], [2, 'diagnose', undefined]);
  assert.ok(!existsSync(log) || !readFileSync(log, 'utf8'), 'no agent in a dry run');

  const r = await sdlc(root, ['bands', 'check', '--agent', 'codex'], { STUB_LOG: log });
  assert.equal(r.code, 0, r.err);
  assert.match(readFileSync(log, 'utf8'), /codex exec --sandbox read-only/);
  assert.equal(execFileSync('git', ['branch', '--list', 'change/*'], { cwd: root, encoding: 'utf8' }).trim(), '');
});

test('bands: single readings build a local history; http-json and prometheus sources; failing sources exit 1', async () => {
  let reading = 11;
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url!.startsWith('/metric')) res.end(JSON.stringify({ data: { value: reading }, auth: req.headers.authorization }));
    else if (req.url!.startsWith('/api/v1/query_range')) {
      const q = new URL(req.url!, 'http://x').searchParams;
      const ok = q.get('query') === 'rate(errors[5m])' && Number(q.get('end')) - Number(q.get('start')) === 7 * 86400 && q.get('step') === '3600';
      res.end(JSON.stringify({ data: { result: ok ? [{ values: [...SERIES, 40].map((v, i) => [i, String(v)]) }] : [] } }));
    } else res.writeHead(500).end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const root = project({});
    bands(
      root,
      `bands:
  - metric: queue_depth
    min_points: 3
    source: { http_json: { url: "${api}/metric", path: data.value, headers: { authorization: "Bearer \${METRICS_TOKEN}" } } }
    tiers: { 3sigma: { action: log } }
  - metric: error_rate
    source: { prometheus: { url: "${api}", query: "rate(errors[5m])", range: 7d, step: 1h } }
    tiers: { 3sigma: { action: log } }
  - metric: broken
    source: { command: "exit 3" }
    tiers: { 1sigma: { action: log } }
`,
    );
    const env = { METRICS_TOKEN: 'tok' };
    for (const v of [10, 12, 10, 12]) {
      reading = v;
      await sdlc(root, ['bands', 'check'], env);
    }
    const history = readFileSync(join(root, '.sdlc/bands/queue_depth.jsonl'), 'utf8').trim().split('\n');
    assert.equal(history.length, 4);
    reading = 50;
    const r = await sdlc(root, ['bands', 'check', '--json'], env);
    assert.equal(r.code, 1, 'a failing source makes the scheduled run red');
    const { results } = JSON.parse(r.out);
    const by = Object.fromEntries(results.map((x: { metric: string }) => [x.metric, x]));
    assert.deepEqual([by.queue_depth.source, by.queue_depth.level, by.queue_depth.points], ['history', 3, 5]);
    assert.deepEqual([by.error_rate.source, by.error_rate.level, by.error_rate.value], ['series', 3, 40]);
    assert.equal(by.broken.status, 'error');
    assert.match(by.broken.error, /command failed: exit 3/);
    assert.match(readFileSync(join(root, '.sdlc/.gitignore'), 'utf8'), /^bands\/$/m, 'history stays local');
  } finally {
    server.close();
  }
});
