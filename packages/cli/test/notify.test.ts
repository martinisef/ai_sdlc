// `sdlc notify` end to end: the CLI posts to a local webhook, in Slack and generic formats.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { commitAll, project, sdlc } from './helpers.ts';

const posts: { url: string; body: any }[] = [];
let status = 200;
let hook = '';
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    posts.push({ url: req.url!, body: JSON.parse(raw) });
    res.writeHead(status).end('ok');
  });
});
before(async () => {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  hook = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});
after(() => server.close());

function changeRepo(config: object = {}): string {
  const root = project({ locale: 'en', roles: { po: ['@ana'] }, gates: { spec: ['po'] }, ...config });
  mkdirSync(join(root, 'changes/claims-export'), { recursive: true });
  writeFileSync(join(root, 'changes/claims-export/intent.md'), '---\nstatus: accepted\n---\n# Claims export\n');
  writeFileSync(join(root, 'changes/claims-export/spec.md'), '---\nstatus: draft\n---\n# Claims export\n');
  commitAll(root, 'change');
  return root;
}

test('slack: gate.pending mentions the approvers and links the PR', async () => {
  const root = changeRepo({ notify: { format: 'slack', people: { '@ana': 'U123' } } });
  posts.length = 0;
  const r = await sdlc(root, ['notify', 'gate.pending', '--change', 'claims-export', '--artifact', 'spec', '--pr-url', 'https://github.com/acme/shop/pull/7'], { SDLC_NOTIFY_WEBHOOK: hook });
  assert.equal(r.code, 0, r.err);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, '/hook');
  const { text, blocks } = posts[0].body;
  assert.match(text, /Claims export/, 'text is the notification preview');
  const section = blocks[0].text.text;
  assert.match(section, /<@U123>/, 'people map to Slack mentions');
  assert.match(section, /<https:\/\/github\.com\/acme\/shop\/pull\/7\|PR>/);
});

test('generic (the default for a URL that is not hooks.slack.com): the payload carries the event fields', async () => {
  const root = changeRepo();
  posts.length = 0;
  const r = await sdlc(root, ['notify', 'gate.decided', '--change', 'claims-export', '--artifact', 'spec', '--decision', 'rejected', '--by', 'Ana', '-m', 'needs columns'], {
    SDLC_NOTIFY_WEBHOOK: hook,
  });
  assert.equal(r.code, 0, r.err);
  const body = posts[0].body;
  assert.equal(body.event, 'gate.decided');
  assert.equal(body.artifact, 'spec');
  assert.equal(body.decision, 'rejected');
  assert.equal(body.by, 'Ana');
  assert.match(body.text, /needs columns/);
});

test('--dry-run prints the payload and sends nothing; no webhook is not an error', async () => {
  const root = changeRepo();
  posts.length = 0;
  const dry = await sdlc(root, ['notify', 'spec.ready', '--change', 'claims-export', '--dry-run'], { SDLC_NOTIFY_WEBHOOK: hook });
  assert.equal(dry.code, 0, dry.err);
  assert.match(JSON.parse(dry.out).text, /Claims export/);
  assert.equal(posts.length, 0);
  const none = await sdlc(root, ['notify', 'spec.ready', '--change', 'claims-export'], { SDLC_NOTIFY_WEBHOOK: undefined });
  assert.equal(none.code, 0);
  assert.equal(posts.length, 0);
});

test('fail-open: a webhook error is reported but the command still exits 0', async () => {
  const root = changeRepo();
  status = 500;
  try {
    const r = await sdlc(root, ['notify', 'spec.ready', '--change', 'claims-export'], { SDLC_NOTIFY_WEBHOOK: hook });
    assert.equal(r.code, 0);
    assert.match(r.err, /500/);
  } finally {
    status = 200;
  }
});

test('usage errors: unknown event, bad --artifact, unknown --change exit 1', async () => {
  const root = changeRepo();
  assert.equal((await sdlc(root, ['notify', 'gate.exploded'])).code, 1);
  assert.equal((await sdlc(root, ['notify', 'gate.pending', '--artifact', 'design'])).code, 1);
  const missing = await sdlc(root, ['notify', 'gate.pending', '--change', 'nope', '--dry-run']);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /no change 'nope'/);
});
