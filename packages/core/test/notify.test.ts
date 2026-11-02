import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { getChange, loadConfig, notify, notifyPayload } from '../src/index.ts';
import { repo, writeArtifact } from './helpers.ts';

const CONFIG = {
  version: 1,
  locale: 'en',
  gates: { spec: ['po'] },
  roles: { po: ['@priya', 'dev@example.com'] },
  notify: { format: 'slack', people: { '@priya': 'U012ABC' } },
};
const GH = { GITHUB_REPOSITORY: 'acme/app', GITHUB_SERVER_URL: 'https://github.com', PR_NUMBER: '12', HEAD_REF: 'change/export' };

function setup(config: object = CONFIG) {
  const root = repo(config);
  writeArtifact(root, '2026-11-export', 'intent', 'accepted');
  writeArtifact(root, '2026-11-export', 'spec', 'draft');
  const loaded = loadConfig(root)!;
  return { root, loaded, change: getChange(root, '2026-11-export')! };
}

async function receiver(status = 200) {
  const bodies: unknown[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      bodies.push(JSON.parse(raw));
      res.writeHead(status).end(status === 200 ? 'ok' : 'boom');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  return { url, bodies, close: () => server.close() };
}

test('slack payload: title, stage, who acts with mentions, PR and artifact links', () => {
  const { loaded, change } = setup();
  assert.deepEqual(notifyPayload({ event: 'gate.pending', change, artifact: 'spec' }, loaded, GH), {
    text: 'export (Claims status): the spec is waiting for approval',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            '*export (Claims status): the spec is waiting for approval*',
            'Stage: spec-draft',
            'Who acts: <@U012ABC>, dev@example.com',
            '<https://github.com/acme/app/pull/12|PR> · <https://github.com/acme/app/blob/change/export/changes/2026-11-export/spec.md|spec.md>',
          ].join('\n'),
        },
      },
    ],
  });
});

test('generic payload: plain text for Teams/Discord plus structured fields', () => {
  const { loaded, change } = setup({ ...CONFIG, notify: { format: 'generic' } });
  const p = notifyPayload({ event: 'gate.decided', change, artifact: 'spec', decision: 'rejected', by: '@priya', note: 'split it' }, loaded, GH) as any;
  assert.equal(p.title, 'export (Claims status): spec rejected by @priya');
  assert.equal(p.content, p.text);
  assert.match(p.text, /split it\nPR: https:\/\/github.com\/acme\/app\/pull\/12/);
  assert.deepEqual(p.change, { id: 'changes/2026-11-export', slug: 'export', stage: 'spec-draft', ticket: undefined });
});

test('notify: sends, filters by notify.events, and fails open on a 500 or no webhook', async () => {
  const ok = await receiver();
  const { loaded, change } = setup({ ...CONFIG, notify: { ...CONFIG.notify, events: ['gate.pending'] } });
  assert.equal(await notify({ event: 'gate.pending', change }, loaded, { SDLC_NOTIFY_WEBHOOK: ok.url }), 'notify gate.pending: sent');
  assert.match(await notify({ event: 'review.done', change }, loaded, { SDLC_NOTIFY_WEBHOOK: ok.url }), /skipped/);
  assert.equal(ok.bodies.length, 1);
  ok.close();

  const bad = await receiver(500);
  assert.match(await notify({ event: 'gate.pending', change }, loaded, { SDLC_NOTIFY_WEBHOOK: bad.url }), /failed \(HTTP 500; continuing\)/);
  bad.close();
  assert.match(await notify({ event: 'gate.pending', change }, loaded, {}), /off \(SDLC_NOTIFY_WEBHOOK not set\)/);
  assert.match(await notify({ event: 'gate.pending', change }, loaded, { SDLC_NOTIFY_WEBHOOK: 'http://127.0.0.1:1/x' }), /failed/);
});
