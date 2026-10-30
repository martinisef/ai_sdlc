// `sdlc ci …` against stubbed agent CLIs (tests/stubs/claude, codex) and gh.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitAll, project, sdlc } from './helpers.ts';

const stubLog = () => join(mkdtempSync(join(tmpdir(), 'sdlc-stub-')), 'calls.log');
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

test('ci review: runs the agent read-only, posts the comment and writes the tally', async () => {
  const root = project({ vcs: { provider: 'github' } }, 'change/x');
  const log = stubLog();
  const r = await sdlc(root, ['ci', 'review'], { STUB_LOG: log, PR_NUMBER: '5', BASE_REF: 'main' });
  assert.equal(r.code, 0, r.err);
  const calls = read(log);
  assert.match(calls, /claude -p You are the automated reviewer/);
  assert.match(calls, /--allowedTools Read,Grep,Glob,Bash\(git diff:\*\)/);
  assert.doesNotMatch(calls, /acceptEdits/);
  assert.match(calls, /gh pr comment 5 --body ## Automated review/);
  assert.equal(readFileSync(join(root, 'review-tally.txt'), 'utf8'), 'Important: 1 · Nit: 0\n');

  const none = await sdlc(root, ['ci', 'review'], { STUB_LOG: log });
  assert.equal(none.code, 0);
  assert.match(none.err, /not a PR\/MR/);
});

test('ci review with codex: sandboxed read-only, answer taken from the last message', async () => {
  const root = project({ vcs: { provider: 'github' }, ci: { agent: 'codex', model: 'gpt-x' } }, 'change/x');
  const log = stubLog();
  const r = await sdlc(root, ['ci', 'review', '--dry-run'], { STUB_LOG: log, PR_NUMBER: '5' });
  assert.equal(r.code, 0, r.err);
  assert.match(read(log), /codex exec --sandbox read-only --output-last-message \S+ -m gpt-x/);
  assert.equal(r.out, '## Automated review (ai-sdlc)\n\nImportant: 0 · Nit: 2', 'stdout noise is ignored');
  assert.doesNotMatch(read(log), /gh pr comment/, 'dry run does not post');
  assert.equal(readFileSync(join(root, 'review-tally.txt'), 'utf8'), 'Important: 0 · Nit: 2\n');

  const bad = await sdlc(root, ['ci', 'review', '--agent', 'gemini'], { STUB_LOG: log, PR_NUMBER: '5' });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /unknown agent 'gemini'/);
});

test('ci intent-to-spec: only accepted intents without a spec; pushes the new commits', async () => {
  const root = project({}, 'change/a');
  const intent = (slug: string, status: string, spec = false) => {
    mkdirSync(join(root, 'changes', slug), { recursive: true });
    writeFileSync(join(root, 'changes', slug, 'intent.md'), `---\nstatus: ${status}\n---\n# Intent\n`);
    if (spec) writeFileSync(join(root, 'changes', slug, 'spec.md'), '---\nstatus: draft\n---\n');
  };
  intent('a', 'accepted');
  intent('b', 'draft');
  intent('c', 'approved', true);
  commitAll(root, 'intents');
  const remote = join(mkdtempSync(join(tmpdir(), 'sdlc-remote-')), 'r.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });

  const log = stubLog();
  const r = await sdlc(root, ['ci', 'intent-to-spec'], { STUB_LOG: log });
  assert.equal(r.code, 0, r.err);
  const calls = read(log);
  assert.equal(calls.split('\n').filter(Boolean).length, 1, 'one agent run');
  assert.match(calls, /Use the sdlc-spec skill in headless mode for the change changes\/a\./);
  assert.match(calls, /--permission-mode acceptEdits/);
  assert.ok(existsSync(join(root, 'changes/a/spec.md')));
  assert.equal(execFileSync('git', ['log', '-1', '--format=%s', 'change/a'], { cwd: remote, encoding: 'utf8' }).trim(), 'spec: changes/a');

  const again = await sdlc(root, ['ci', 'intent-to-spec'], { STUB_LOG: log });
  assert.equal(again.code, 0);
  assert.match(again.err, /no accepted intents without a spec/);
});

test('ci triage: prints the summary off-PR, comments on a PR', async () => {
  const root = project({ vcs: { provider: 'github' } });
  const buildLog = join(root, 'build.log');
  writeFileSync(buildLog, 'ETIMEDOUT\n');
  const log = stubLog();
  const off = await sdlc(root, ['ci', 'triage', buildLog], { STUB_LOG: log });
  assert.equal(off.code, 0, off.err);
  assert.match(off.out, /## Automated triage \(ai-sdlc\)/);
  await sdlc(root, ['ci', 'triage', buildLog], { STUB_LOG: log, CI_MERGE_REQUEST_IID: '8' });
  assert.match(read(log), /gh pr comment 8 --body ## Automated triage/);
  assert.equal((await sdlc(root, ['ci', 'triage', 'missing.log'], { STUB_LOG: log })).code, 1);
});

test('ci jira-merged: no tracker → no-op; ticket keys from the merge commit and branch', async () => {
  const root = project({});
  const off = await sdlc(root, ['ci', 'jira-merged']);
  assert.equal(off.code, 0);
  assert.match(off.err, /tracker not configured/);

  const withJira = project({ tracker: { provider: 'jira', base_url: 'http://127.0.0.1:9', project_key: 'PROJ' } });
  const r = await sdlc(withJira, ['ci', 'jira-merged'], { JIRA_PAT: 'p', MERGED_BRANCH: 'change/PROJ-12-x', HEAD_REF: 'main' });
  assert.equal(r.code, 0, 'Jira failures never fail the pipeline');
  assert.match(r.err, /could not transition PROJ-12/);
});

test('ci evals: worktree per case, checks, pass rate', async () => {
  const root = project({});
  mkdirSync(join(root, 'evals'));
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'tests/a.test'), 'x\n');
  const ev = (name: string, prompt: string, checks: object[]) => writeFileSync(join(root, 'evals', `${name}.json`), JSON.stringify({ name, prompt, checks }));
  writeFileSync(join(root, 'evals/_example.json'), '{}');
  ev('writes-src', 'WRITE src/new.txt please', [
    { type: 'command', run: 'test -f src/new.txt' },
    { type: 'diff_includes', glob: 'src/**' },
    { type: 'diff_excludes', glob: 'tests/**' },
    { type: 'output_contains', text: 'TESTS PASS' },
  ]);
  ev('touches-tests', 'WRITE tests/a.test', [{ type: 'diff_excludes', glob: 'tests/**' }]);
  commitAll(root, 'evals');

  const log = stubLog();
  const r = await sdlc(root, ['ci', 'evals'], { STUB_LOG: log });
  assert.equal(r.code, 1, 'one of two passes: 0.5 < 0.8');
  assert.match(r.out, /PASS writes-src/);
  assert.match(r.out, /FAIL touches-tests\n {2}diff touches tests\/\*\* \(tests\/a.test\)/);
  assert.match(r.out, /pass rate: 1\/2 = 0.50 \(minimum 0.8\)/);
  assert.ok(!existsSync(join(root, 'src/new.txt')), 'the agent ran in a throwaway worktree');
  assert.equal(execFileSync('git', ['worktree', 'list'], { cwd: root, encoding: 'utf8' }).trim().split('\n').length, 1, 'worktrees removed');

  assert.equal((await sdlc(root, ['ci', 'evals', 'writes-*'], { STUB_LOG: log })).code, 0, 'pattern filter');
  assert.equal((await sdlc(root, ['ci', 'evals'], { STUB_LOG: log, EVAL_MIN_PASS_RATE: '0.5' })).code, 0);
});

test('ci mention: read-only by default, replies without re-mentioning; edit mode commits and pushes', async () => {
  const root = project({ vcs: { provider: 'github' } }, 'change/x');
  const remote = join(mkdtempSync(join(tmpdir(), 'sdlc-remote-')), 'r.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
  execFileSync('git', ['push', '-q', 'origin', 'main', 'change/x'], { cwd: root });
  const env = { PR_NUMBER: '7', BASE_REF: 'main', HEAD_REF: 'change/x', SDLC_MENTION_AUTHOR: 'ana', SDLC_MENTION_BODY: '@claude is this guard right? WRITE src.txt' };

  const log = stubLog();
  const r = await sdlc(root, ['ci', 'mention'], { ...env, STUB_LOG: log });
  assert.equal(r.code, 0, r.err);
  const calls = read(log);
  assert.match(calls, /claude -p ana mentioned you in a comment on PR\/MR #7/);
  assert.doesNotMatch(calls, /acceptEdits/);
  assert.match(calls, /gh pr comment 7 --body ## Agent reply \(ai-sdlc\)/);
  assert.match(calls, /> @\u200bclaude is this guard right/, 'the quote cannot trigger the webhook again');
  assert.ok(!existsSync(join(root, 'src.txt')), 'read mode does not edit');

  writeFileSync(join(root, '.sdlc/config.json'), JSON.stringify({ version: 1, vcs: { provider: 'github' }, ci: { mention_mode: 'edit' } }));
  commitAll(root, 'edit mode');
  const log2 = stubLog();
  const e = await sdlc(root, ['ci', 'mention'], { ...env, STUB_LOG: log2 });
  assert.equal(e.code, 0, e.err);
  assert.match(read(log2), /--permission-mode acceptEdits/);
  assert.equal(execFileSync('git', ['log', '-1', '--format=%s', 'change/x'], { cwd: remote, encoding: 'utf8' }).trim(), 'fix: src.txt');
  assert.match(read(log2), /Pushed [0-9a-f]+ to change\/x/);

  const missing = await sdlc(root, ['ci', 'mention'], { STUB_LOG: log2 });
  assert.equal(missing.code, 1);
  assert.match(missing.err, /needs PR_NUMBER and SDLC_MENTION_BODY/);
});
