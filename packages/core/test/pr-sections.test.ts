import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPrBody, DEFAULT_PR_SECTIONS, prSections } from '@ai-native-sdlc/core';

const body = (risk: string) => `## Testing\nnpm test\n### Risk\n${risk}\n## How to revert:\nRevert the PR.\n`;

test('prSections: ## and ### headings, comments removed, trailing colons ignored', () => {
  const s = prSections('intro\n## Testing\n<!-- fill in -->\nok\n## How to revert:\n\n');
  assert.equal(s.get('testing'), 'ok');
  assert.equal(s.get('how to revert'), '');
});

test('checkPrBody: required sections filled in, and Risk at least the computed tier', () => {
  assert.deepEqual(checkPrBody(body('Low, docs only'), DEFAULT_PR_SECTIONS, 'low'), { ok: true, missing: [], declared: 'low', problem: undefined });
  assert.equal(checkPrBody(body('high'), DEFAULT_PR_SECTIONS, 'medium').ok, true, 'stating a higher tier is fine');
  assert.equal(checkPrBody(body('low'), DEFAULT_PR_SECTIONS, 'high').problem, '## Risk says low, the change is high (sdlc risk)');
  assert.equal(checkPrBody(body('alto: toca auth'), DEFAULT_PR_SECTIONS, 'high').declared, 'high');
  assert.deepEqual(checkPrBody('## Testing\nok\n', DEFAULT_PR_SECTIONS).missing, ['Risk', 'How to revert']);
  assert.equal(checkPrBody('## Rollout\nflag\n', ['Rollout']).ok, true, 'custom sections from ci.pr_sections');
});
