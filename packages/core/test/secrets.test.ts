import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSecrets } from '../src/policies.ts';

const ctx = { root: '/tmp', loaded: undefined };
const blocked = (content: string) => checkSecrets(ctx, content, 'en').action === 'deny';

test('secrets: a quoted environment variable name is not a credential', () => {
  assert.equal(blocked(`const env = agent === "codex" ? "OPENAI_API_KEY" : "CURSOR_API_KEY";`), false);
  assert.equal(blocked(`{ "apiKey": "ANTHROPIC_API_KEY" }`), false);
  assert.equal(blocked(`token = 'GITHUB_TOKEN_FOR_CI'`), false);
});

test('secrets: real-looking values are still blocked, also after a variable name on the same line', () => {
  assert.equal(blocked(`api_key = "9f8e7d6c5b4a39281706f5e4d3c2b1a0"`), true);
  assert.equal(blocked(`{ "password": "ABCDEFGHIJKLMNOPQRST" }`), true, 'uppercase without underscores can be a key');
  assert.equal(blocked(`a = "OPENAI_API_KEY"; secret: "s3cr3tValueThatIsLong1234"`), true);
  assert.equal(blocked(`k = "AKIAABCDEFGHIJKLMNOP"`), true);
});
