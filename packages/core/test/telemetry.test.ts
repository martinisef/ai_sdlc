import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { funnel, loadConfig, maybeSendTelemetry, readTelemetry, recordEvent, telemetryState, writeTelemetry } from '../src/index.ts';
import { gitIn, repo, writeArtifact } from './helpers.ts';

test('funnel: each change counts for every step it reached; quick lane apart', () => {
  const root = repo({ version: 1 });
  writeArtifact(root, '2026-11-a', 'intent', 'accepted');
  writeArtifact(root, '2026-11-a', 'spec', 'approved');
  writeArtifact(root, '2026-11-b', 'intent', 'draft');
  writeArtifact(root, '2026-11-c', 'intent', 'accepted', 'lane: quick\n');
  writeArtifact(root, '2026-11-d', 'intent', 'draft', 'lane: full\n');
  recordEvent(root, { type: 'setup.init' });
  recordEvent(root, { type: 'change.new', change: 'a' });
  const f = funnel(root, loadConfig(root));
  assert.deepEqual(f.loop, { started: 3, 'intent-accepted': 1, 'spec-approved': 1, 'plan-approved': 0, building: 0, merged: 0 });
  assert.deepEqual(f.quick, { started: 2, merged: 0, promoted: 1 });
  assert.equal(f.firsts.change, 0);
});

test('telemetry: off by default, DO_NOT_TRACK wins, sends at most daily, no PII in the payload', async () => {
  const root = repo({ version: 1, roles: { po: ['ana@example.com'] } });
  gitIn(root, 'checkout', '-qb', 'change/secret-project');
  writeArtifact(root, '2026-11-secret-project', 'intent', 'draft', 'author: Ana Product\n');
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      bodies.push(b);
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/t`;
  const env = { HOME: mkdtempSync(join(tmpdir(), 'home-')), SDLC_TELEMETRY_URL: url } as NodeJS.ProcessEnv;
  try {
    assert.equal(telemetryState(env), 'off');
    assert.equal(await maybeSendTelemetry(root, loadConfig(root), '0.0.0', env), false);
    writeTelemetry({ ...readTelemetry(env), enabled: true }, env);
    assert.equal(telemetryState({ ...env, DO_NOT_TRACK: '1' }), 'blocked-dnt');
    assert.equal(await maybeSendTelemetry(root, loadConfig(root), '0.0.0', { ...env, DO_NOT_TRACK: '1' }), false);
    assert.equal(telemetryState({ ...env, SDLC_TELEMETRY_URL: '' }), 'no-endpoint');

    assert.equal(await maybeSendTelemetry(root, loadConfig(root), '0.0.0', env), true);
    assert.equal(await maybeSendTelemetry(root, loadConfig(root), '0.0.0', env), false, 'once a day');
    assert.equal(bodies.length, 1);
    const body = bodies[0];
    for (const pii of ['ana@example.com', 'Ana Product', 'secret-project', root]) assert.ok(!body.includes(pii), `payload leaks ${pii}`);
    const p = JSON.parse(body);
    assert.equal(p.schema, 1);
    assert.equal(p.funnel.loop.started, 1);
  } finally {
    server.close();
  }
});
