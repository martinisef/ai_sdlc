import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig, nextAction, formatNext } from '../src/index.ts';
import { gitIn, repo, writeArtifact } from './helpers.ts';

test('nextAction: not configured → init; nothing open → new', () => {
  const root = repo({ version: 1 });
  assert.equal(nextAction(root, undefined).kind, 'init');
  assert.equal(nextAction(root, loadConfig(root)).kind, 'new');
});

test('nextAction: the active change drives the step; gates depend on who is asking', () => {
  const root = repo({ version: 1, gates: { spec: ['po'] }, roles: { po: ['ana@example.com'] } });
  gitIn(root, 'checkout', '-qb', 'change/claims');
  writeArtifact(root, '2026-11-claims', 'intent', 'draft');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'intent');
  const loaded = loadConfig(root);
  const ana = { name: 'Ana', email: 'ana@example.com' };
  const bob = { name: 'Bob', email: 'bob@example.com' };

  const n = nextAction(root, loaded, { who: ana });
  assert.equal(n.kind, 'approve');
  assert.equal(n.command, 'sdlc approve claims intent');

  writeArtifact(root, '2026-11-claims', 'intent', 'accepted');
  assert.equal(nextAction(root, loaded, { who: ana }).skill, '/sdlc-spec');

  writeArtifact(root, '2026-11-claims', 'spec', 'draft');
  const wait = nextAction(root, loaded, { who: bob });
  assert.equal(wait.kind, 'wait');
  assert.deepEqual(wait.waitingOn, ['ana@example.com']);
  assert.match(formatNext(nextAction(root, loaded, { who: ana })), /→ sdlc approve claims spec/);
});

test('nextAction: off a change branch, gates you can decide come first, then your open change', () => {
  const root = repo({ version: 1 });
  gitIn(root, 'checkout', '-qb', 'change/export');
  writeArtifact(root, '2026-11-export', 'intent', 'accepted');
  writeArtifact(root, '2026-11-export', 'spec', 'draft', 'author: Bob\n');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-qm', 'spec');
  gitIn(root, 'checkout', '-q', 'main');
  const loaded = loadConfig(root);

  const ana = nextAction(root, loaded, { who: { name: 'Ana', email: 'ana@example.com' } });
  assert.equal(ana.kind, 'approve');
  assert.equal(ana.change, 'export');

  const bob = nextAction(root, loaded, { who: { name: 'Bob', email: 'bob@example.com' } });
  assert.equal(bob.kind, 'switch', 'the author cannot approve their own spec');
  assert.equal(bob.command, 'git checkout change/export');
});
