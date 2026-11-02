import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { NextAction } from '@ai-native-sdlc/core';
import { resolveCli, shellLine } from '../src/cli.ts';
import { menuItems, parseStatus, statusBar, treeGroups, type StatusLine } from '../src/format.ts';

const line = (slug: string, stage: StatusLine['stage'], statuses: string, active = false): StatusLine => ({
  change: `changes/2026-11-${slug}`,
  slug,
  title: '',
  stage,
  ticket: '',
  statuses,
  active,
  next: '',
});

const approve: NextAction = {
  kind: 'approve',
  change: 'export',
  artifact: 'spec',
  stage: 'spec-draft',
  command: 'sdlc approve export spec',
  message: 'Your call: the spec of export',
  inbox: [{ change: 'billing', artifact: 'plan' }],
};

test('parseStatus reads JSON lines and skips anything else', () => {
  const out = `${JSON.stringify(line('export', 'spec-draft', 'accepted/draft/-', true))}\nwarning: x\n`;
  assert.deepEqual(parseStatus(out).map((l) => l.slug), ['export']);
  assert.deepEqual(parseStatus(''), []);
});

test('statusBar: one line per kind, inbox count, and a CLI that did not answer', () => {
  assert.deepEqual(statusBar(approve), {
    text: '$(pass) export · approve spec $(inbox) 1',
    tooltip: 'Your call: the spec of export\nsdlc approve export spec\n1 more gate(s) waiting on you',
  });
  assert.equal(statusBar({ kind: 'agent', change: 'export', skill: '/sdlc-plan', message: 'Next: /sdlc-plan', inbox: [] }).text, '$(sparkle) export · /sdlc-plan');
  assert.equal(statusBar({ kind: 'wait', change: 'export', waitingOn: ['@priya'], message: 'm', inbox: [] }).text, '$(watch) export · waiting on @priya');
  assert.equal(statusBar({ kind: 'init', command: 'sdlc init', message: 'm', inbox: [] }).text, '$(gear) sdlc: set up');
  assert.match(statusBar(undefined).text, /circle-slash/);
});

test('menuItems: my gates first, the active change artifacts, then the fixed actions', () => {
  const changes = [line('export', 'spec-draft', 'accepted/draft/-', true), line('billing', 'plan-draft', 'accepted/approved/draft')];
  const items = menuItems(approve, changes);
  assert.deepEqual(
    items.map((i) => [i.id, i.change ?? '', i.artifact ?? '']),
    [
      ['approve', 'export', 'spec'],
      ['reject', 'export', 'spec'],
      ['approve', 'billing', 'plan'],
      ['reject', 'billing', 'plan'],
      ['open', 'changes/2026-11-export', 'intent'],
      ['open', 'changes/2026-11-export', 'spec'],
      ['quick', '', ''],
      ['dashboard', '', ''],
      ['doctor', '', ''],
    ],
  );
  const wait = menuItems({ kind: 'wait', change: 'export', message: 'waiting', inbox: [] }, changes);
  assert.equal(wait[0].id, 'next');
  assert.ok(!wait.some((i) => i.id === 'approve'), 'no approve when nothing waits on me');
});

test('treeGroups: "Waiting on my gate" then columns by stage, empty ones skipped', () => {
  const changes = [line('export', 'spec-draft', 'accepted/draft/-', true), line('billing', 'plan-draft', 'accepted/approved/draft'), line('typo', 'quick-ready', 'accepted/-/-')];
  const groups = treeGroups(changes, approve);
  assert.deepEqual(
    groups.map((g) => [g.label, g.entries.map((e) => `${e.slug}:${e.artifact}:${e.contextValue}`)]),
    [
      ['Waiting on my gate', ['export:spec:gate', 'billing:plan:gate']],
      ['Spec', ['export:spec:change']],
      ['Plan', ['billing:plan:change']],
      ['Build', ['typo:intent:change']],
    ],
  );
  assert.equal(groups[1].entries[0].description, 'spec-draft · active');
});

test('resolveCli: setting, then node_modules/.bin, then the bundled CLI under ELECTRON_RUN_AS_NODE', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-vscode-'));
  const bundled = resolveCli(root, '/ext', '', '/Applications/Code Helper', 'darwin');
  assert.deepEqual(bundled, { cmd: '/Applications/Code Helper', args: ['/ext/dist/cli/sdlc.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' }, label: 'bundled CLI' });
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.bin/sdlc'), '');
  assert.equal(resolveCli(root, '/ext', '', 'node', 'darwin').label, 'node_modules/.bin/sdlc');
  assert.equal(resolveCli(root, '/ext', '/opt/sdlc').cmd, '/opt/sdlc');
  assert.equal(shellLine(bundled, ['quick', "fix the user's email"], 'darwin'), `'/Applications/Code Helper' /ext/dist/cli/sdlc.mjs quick 'fix the user'\\''s email'`);
  assert.equal(shellLine(bundled, ['ui'], 'win32'), '& "/Applications/Code Helper" "/ext/dist/cli/sdlc.mjs" "ui"');
});
