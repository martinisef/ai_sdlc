import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createWebhookApp, mentions } from '@ai-native-sdlc/webhook';

interface Call {
  method?: string;
  url?: string;
  headers: IncomingMessage['headers'];
  body: string;
}
const calls: Call[] = [];
let api = '';
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    res.writeHead(201, { 'content-type': 'application/json' }).end('{"id":1}');
  });
});
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const SECRET = 's3cret';
const app = () =>
  createWebhookApp({ SDLC_WEBHOOK_SECRET: SECRET, GITLAB_TRIGGER_TOKEN: 'trig', GITLAB_API: api, BITBUCKET_ACCESS_TOKEN: 'bbt', BITBUCKET_API: api, SDLC_ALLOWED_AUTHORS: 'ana,juan' });

const note = (text: string, user = 'ana') => ({
  object_kind: 'note',
  user: { username: user },
  project: { id: 42, web_url: 'https://gitlab.example.com/g/p' },
  object_attributes: { note: text, noteable_type: 'MergeRequest' },
  merge_request: { iid: 9, source_branch: 'change/x', target_branch: 'main' },
});

test('mentions: whole word, case-insensitive, never our own replies', () => {
  assert.ok(mentions('@claude can you check this?'));
  assert.ok(mentions('thanks — @Claude, one more thing'));
  assert.ok(!mentions('email me at me@claude.ai'));
  assert.ok(!mentions('@claude-bot did it'));
  assert.ok(!mentions('## Agent reply (ai-sdlc)\n\n> @claude why?'));
  assert.ok(mentions('/ask @agent', '@agent'));
});

test('gitlab: token checked, MR note with a mention triggers the pipeline with sdlc ci mention variables', async () => {
  const post = (body: object, token = SECRET, event = 'Note Hook') =>
    app().request('/gitlab', { method: 'POST', headers: { 'x-gitlab-token': token, 'x-gitlab-event': event, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await post(note('@claude why?'), 'wrong')).status, 401);
  calls.length = 0;
  const r = await post(note('@claude why is the guard inverted?'));
  assert.equal(r.status, 202, await r.clone().text());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/projects/42/trigger/pipeline');
  const form = new URLSearchParams(calls[0].body);
  assert.equal(form.get('token'), 'trig');
  assert.equal(form.get('ref'), 'change/x');
  assert.equal(form.get('variables[SDLC_JOB]'), 'mention');
  assert.equal(form.get('variables[PR_NUMBER]'), '9');
  assert.equal(form.get('variables[BASE_REF]'), 'main');
  assert.equal(form.get('variables[SDLC_MENTION_AUTHOR]'), 'ana');
  assert.equal(form.get('variables[SDLC_MENTION_BODY]'), '@claude why is the guard inverted?');

  calls.length = 0;
  for (const ignored of [note('looks good'), note('@claude hi', 'mallory'), note('@claude hi', 'project_42_bot_1'), { ...note('@claude'), object_attributes: { note: '@claude', noteable_type: 'Issue' } }]) {
    const x = await post(ignored);
    assert.equal(x.status, 200);
    assert.ok((await x.json()).ignored);
  }
  assert.equal((await post(note('@claude'), SECRET, 'Push Hook')).status, 200);
  assert.equal(calls.length, 0, 'nothing triggered for ignored events');
});

test('bitbucket: HMAC signature checked, PR comment triggers the sdlc-mention custom pipeline', async () => {
  const payload = JSON.stringify({
    actor: { nickname: 'juan' },
    repository: { full_name: 'acme/app' },
    pullrequest: { id: 12, source: { branch: { name: 'change/y' } }, destination: { branch: { name: 'main' } } },
    comment: { content: { raw: '@claude please explain the migration' } },
  });
  const sign = (b: string) => `sha256=${createHmac('sha256', SECRET).update(b).digest('hex')}`;
  const post = (sig: string) =>
    app().request('/bitbucket', { method: 'POST', headers: { 'x-hub-signature': sig, 'x-event-key': 'pullrequest:comment_created' }, body: payload });

  assert.equal((await post('sha256=00')).status, 401);
  assert.equal((await post(sign(payload + ' '))).status, 401, 'signature covers the raw body');
  calls.length = 0;
  const r = await post(sign(payload));
  assert.equal(r.status, 202, await r.clone().text());
  assert.equal(calls[0].url, '/repositories/acme/app/pipelines/');
  assert.equal(calls[0].headers.authorization, 'Bearer bbt');
  const sent = JSON.parse(calls[0].body);
  assert.deepEqual(sent.target, { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: 'change/y', selector: { type: 'custom', pattern: 'sdlc-mention' } });
  const vars = Object.fromEntries(sent.variables.map((v: { key: string; value: string }) => [v.key, v.value]));
  assert.equal(vars.PR_NUMBER, '12');
  assert.equal(vars.SDLC_MENTION_AUTHOR, 'juan');
  assert.equal(vars.HEAD_REF, 'change/y');
});

test('the secret is mandatory', () => {
  assert.throws(() => createWebhookApp({}), /SDLC_WEBHOOK_SECRET/);
});
