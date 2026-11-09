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

function reviewRepo(config: object = {}) {
  const root = project({ vcs: { provider: 'github' }, ...config }, 'change/x');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/a.py'), 'def f(xs):\n    out = []\n    for i in range(len(xs) + 1):\n        out.append(xs[i])\n    x = len(out)\n    return x\n');
  commitAll(root, 'feat: f');
  return root;
}

const head = (root: string) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const stateComment = (state: object, extra: object = {}) =>
  JSON.stringify({ id: '41', author: 'github-actions[bot]', association: 'NONE', createdAt: '2026-11-01T00:00:00Z', body: `## Automated review (ai-sdlc)\n<!-- sdlc:review-summary -->\n<!-- sdlc:review-state ${Buffer.from(JSON.stringify(state)).toString('base64')} -->`, ...extra }) + '\n';

test('ci review: a finder per pass, the verifier drops what it does not support, inline comments and a summary that starts with the counts', async () => {
  const root = reviewRepo();
  const log = stubLog();
  const r = await sdlc(root, ['ci', 'review'], { STUB_LOG: log, STUB_DROP: 'f2', PR_NUMBER: '5', BASE_REF: 'main', HEAD_REF: 'change/x' });
  assert.equal(r.code, 0, r.err);
  const calls = read(log);
  assert.equal(calls.match(/^claude -p You are a review finder/gm)?.length, 1, 'low risk: Quick review, one finder');
  assert.match(calls, /Your pass: every pass in REVIEW.md/);
  assert.equal(calls.match(/^claude -p You are the review verifier/gm)?.length, 1);
  assert.match(calls, /--allowedTools Read,Grep,Glob,Bash\(git diff:\*\)/);
  assert.doesNotMatch(calls, /acceptEdits/);
  assert.match(calls, /gh api -X POST repos\/\{owner\}\/\{repo\}\/pulls\/5\/comments -f body=\*\*Important\*\* · off-by-one · f1\n\noff by one/);
  assert.match(calls, /statuses\/[0-9a-f]{40} -f state=failure -f context=sdlc\/review -f description=1 open: f1 Important src\/a.py:3/);
  assert.match(calls, new RegExp(`-f commit_id=${head(root)} -f path=src/a.py -F line=3 -f side=RIGHT`));
  assert.doesNotMatch(calls.slice(calls.indexOf('gh api -X POST')), /rename x to count/, 'the dropped nit is not posted anywhere');
  assert.match(calls, /gh pr comment 5 --body ## Automated review \(ai-sdlc\)\n\nImportant: 1 · Nit: 0 · Pre-existing: 0\n\nRound 1 of 3 · Quick review \(risk low\)/);
  assert.match(calls, /The verifier dropped 1 candidate/);
  assert.equal(readFileSync(join(root, 'review-tally.txt'), 'utf8'), 'Important: 1 · Nit: 0 · Pre-existing: 0\n');
  const json = JSON.parse(readFileSync(join(root, 'review.json'), 'utf8'));
  assert.equal(json.depth, 'quick');
  assert.deepEqual(json.findings.map((f: { id: string; status: string; bug_class: string }) => [f.id, f.status, f.bug_class]), [['f1', 'open', 'off-by-one']]);

  const none = await sdlc(root, ['ci', 'review'], { STUB_LOG: log });
  assert.equal(none.code, 0);
  assert.match(none.err, /not a PR\/MR/);
});

test('ci review: depth follows the tier or ci.review.depth; deep runs five passes and three verifier votes', async () => {
  const standard = reviewRepo({ ci: { review: { depth: 'standard' } } });
  const log = stubLog();
  const r = await sdlc(standard, ['ci', 'review', '--dry-run'], { STUB_LOG: log, PR_NUMBER: '5' });
  assert.equal(r.code, 0, r.err);
  assert.equal(read(log).match(/^claude -p You are a review finder/gm)?.length, 3);
  for (const pass of ['Bugs', 'Security', 'Compliance']) assert.match(read(log), new RegExp(`Your pass: ${pass}:`));
  assert.match(r.out, /^## Automated review \(ai-sdlc\)\n\nImportant: 1 · Nit: 1 · Pre-existing: 0\n\nRound 1 of 3 · Standard review/);
  assert.match(r.out, /\| Important \| `src\/a.py:3` \| off by one — range\(len\(xs\) \+ 1\) reads past the end \| off-by-one \| bugs \|/);
  assert.doesNotMatch(read(log), /gh /, 'dry run does not post');

  const high = reviewRepo({ risk: { high_risk_paths: ['src/**'] } });
  const log2 = stubLog();
  await sdlc(high, ['ci', 'review', '--dry-run'], { STUB_LOG: log2, PR_NUMBER: '5' });
  assert.equal(read(log2).match(/^claude -p You are a review finder/gm)?.length, 5);
  assert.equal(read(log2).match(/^claude -p You are the review verifier/gm)?.length, 3);
});

test('ci review: the next round reviews only the new commits, never repeats a finding and notices fixes', async () => {
  const root = reviewRepo();
  const first = head(root);
  writeFileSync(join(root, 'src/a.py'), read(join(root, 'src/a.py')) + '# more\n');
  commitAll(root, 'fix: more');
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-stub-'));
  const log = join(dir, 'calls.log');
  const f1 = { id: 'f1', severity: 'important', file: 'src/a.py', line: 3, title: 'off by one', evidence: '', bug_class: 'off-by-one', pass: 'bugs', status: 'open', round: 1 };
  writeFileSync(join(dir, 'issues_5_comments'), stateComment({ round: 1, sha: first, findings: [f1] }));
  const env = { STUB_LOG: log, STUB_GH_DIR: dir, STUB_FIXED: 'f1', PR_NUMBER: '5', BASE_REF: 'main', HEAD_REF: 'change/x' };
  const r = await sdlc(root, ['ci', 'review'], env);
  assert.equal(r.code, 0, r.err);
  const calls = read(log);
  assert.match(calls, new RegExp(`Diff to review: git diff ${first}\\.\\.HEAD\\. These are only the commits since the last review round`));
  assert.match(calls, /Already reported \(do not report them again, even reworded\):\n- src\/a.py:3 \[off-by-one\] off by one/);
  assert.match(calls, /New candidates: \[\{"id":"f2"/, 'the repeated off-by-one is not a new candidate');
  assert.match(calls, /Findings still open from earlier rounds: \[\{"id":"f1"/);
  assert.match(calls, /issues\/comments\/41 -f body=## Automated review \(ai-sdlc\)\n\nImportant: 0 · Nit: 1 · Pre-existing: 0\n\nRound 2 of 3/);
  assert.match(calls, /Fixed since the last round: `src\/a.py:3` off by one/);
  assert.doesNotMatch(calls, /pulls\/5\/comments -f body=\*\*Important/, 'the old finding is not commented again');

  writeFileSync(join(dir, 'issues_5_comments'), stateComment({ round: 1, sha: head(root), findings: [] }));
  const again = await sdlc(root, ['ci', 'review'], env);
  assert.match(again.err, /was already reviewed \(round 1\)/);

  writeFileSync(join(dir, 'issues_5_comments'), stateComment({ round: 9, sha: first, findings: [] }, { author: 'mallory', association: 'CONTRIBUTOR' }));
  writeFileSync(log, '');
  await sdlc(root, ['ci', 'review'], env);
  assert.match(read(log), /Round 1 of 3/, 'a state comment from a contributor is ignored');
});

test('ci review: after the round cap no finder runs; the verifier only rechecks the open findings', async () => {
  const root = reviewRepo();
  const first = head(root);
  writeFileSync(join(root, 'src/a.py'), read(join(root, 'src/a.py')) + '# more\n');
  commitAll(root, 'fix: more');
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-stub-'));
  const log = join(dir, 'calls.log');
  const f1 = { id: 'f1', severity: 'important', file: 'src/a.py', line: 3, title: 'off by one', evidence: '', bug_class: 'off-by-one', pass: 'bugs', status: 'open', round: 3 };
  writeFileSync(join(dir, 'issues_5_comments'), stateComment({ round: 3, sha: first, findings: [f1] }));
  const r = await sdlc(root, ['ci', 'review'], { STUB_LOG: log, STUB_GH_DIR: dir, PR_NUMBER: '5', BASE_REF: 'main' });
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(read(log), /review finder/);
  assert.match(read(log), /review verifier/);
  assert.match(read(log), /Important: 1 · Nit: 0 · Pre-existing: 0\n\nRound 4 of 3/);
  assert.match(read(log), /Round cap reached \(3\)/);
});

test('ci security: security passes only, its own summary, and security findings block sdlc/review', async () => {
  const root = reviewRepo({ ci: { review: { depth: 'standard' } } });
  const log = stubLog();
  const r = await sdlc(root, ['ci', 'security'], { STUB_LOG: log, PR_NUMBER: '5', BASE_REF: 'main', HEAD_REF: 'change/x' });
  assert.equal(r.code, 0, r.err);
  const calls = read(log);
  assert.equal(calls.match(/^claude -p You are a security review finder/gm)?.length, 3);
  for (const pass of ['Injection and unsafe input', 'Access control', 'Data exposure and secrets']) assert.match(calls, new RegExp(`Your pass: ${pass}:`));
  assert.match(calls, /-f body=\*\*Nit\*\* · security · path traversal · s1/);
  assert.match(calls, /gh pr comment 5 --body ## Security review \(ai-sdlc\)\n\nImportant: 0 · Nit: 1 · Pre-existing: 0/);
  assert.match(calls, /-f state=failure -f context=sdlc\/review -f description=1 open: s1 security src\/a.py:4/);
  assert.match(read(join(root, 'security-tally.txt')), /^Important: 0 · Nit: 1/);
});

test('ci review-status: a maintainer closes a finding with a reason; a contributor cannot; no review yet is pending', async () => {
  const root = reviewRepo();
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-stub-'));
  const log = join(dir, 'calls.log');
  const env = { STUB_LOG: log, STUB_GH_DIR: dir, PR_NUMBER: '5' };
  const f1 = { id: 'f1', severity: 'important', file: 'src/a.py', line: 3, title: 'off by one', evidence: '', bug_class: 'off-by-one', pass: 'bugs', status: 'open', round: 1 };
  const status = async () => (await sdlc(root, ['ci', 'review-status', '--dry-run'], env)).out;
  assert.equal(await status(), 'sdlc/review: pending — the automated review has not run yet');

  writeFileSync(join(dir, 'issues_5_comments'), stateComment({ round: 1, sha: head(root), findings: [f1] }));
  const inline = (id: string, author: string, association: string, body: string, replyTo?: string) =>
    JSON.stringify({ id, author, association, body, createdAt: `2026-11-02T00:00:0${id.length}Z`, path: 'src/a.py', line: 3, replyTo }) + '\n';
  writeFileSync(join(dir, 'pulls_5_comments'), inline('70', 'github-actions[bot]', 'NONE', '**Important** · off-by-one · f1\n<!-- sdlc:finding id=f1 -->') + inline('71', 'mallory', 'CONTRIBUTOR', 'resolved: trust me', '70'));
  assert.match(await status(), /^sdlc\/review: failure — 1 open: f1 Important src\/a.py:3/);

  writeFileSync(join(dir, 'pulls_5_comments'), inline('70', 'github-actions[bot]', 'NONE', '<!-- sdlc:finding id=f1 -->') + inline('72', 'ana', 'MEMBER', 'resolved: the extra index is a sentinel, see the docstring', '70'));
  assert.equal(await status(), 'sdlc/review: success — no open Important or security findings (1 resolved with a reason)');

  const r = await sdlc(root, ['ci', 'review-status'], env);
  assert.equal(r.code, 0, r.err);
  assert.match(read(log), new RegExp(`statuses/${head(root)} -f state=success -f context=sdlc/review`));
});

test('ci review with codex: sandboxed read-only, answer taken from the last message', async () => {
  const root = project({ vcs: { provider: 'github' }, ci: { agent: 'codex', model: 'gpt-x' } }, 'change/x');
  const log = stubLog();
  const r = await sdlc(root, ['ci', 'review', '--dry-run'], { STUB_LOG: log, PR_NUMBER: '5' });
  assert.equal(r.code, 0, r.err);
  assert.match(read(log), /codex exec --sandbox read-only --output-last-message \S+ -m gpt-x/);
  assert.match(r.out, /^## Automated review \(ai-sdlc\)\n\nImportant: 0 · Nit: 1 · Pre-existing: 0\n/, 'stdout noise is ignored');
  assert.match(r.out, /`src\/b.py:1` \| unused import/);
  assert.doesNotMatch(read(log), /gh pr comment/, 'dry run does not post');
  assert.equal(readFileSync(join(root, 'review-tally.txt'), 'utf8'), 'Important: 0 · Nit: 1 · Pre-existing: 0\n');

  const bad = await sdlc(root, ['ci', 'review', '--agent', 'gemini'], { STUB_LOG: log, PR_NUMBER: '5' });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /unknown agent 'gemini'/);
});

test('ci review with cursor: `agent` found on PATH, trusted workspace, ask mode for read-only', async () => {
  const root = project({ vcs: { provider: 'github' }, ci: { agent: 'cursor' } }, 'change/x');
  const log = stubLog();
  const r = await sdlc(root, ['ci', 'review', '--dry-run'], { STUB_LOG: log, PR_NUMBER: '5' });
  assert.equal(r.code, 0, r.err);
  assert.match(read(log), new RegExp(`^agent -p --output-format text --trust --workspace ${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} --mode ask `, 'm'));
  assert.match(r.out, /^## Automated review \(ai-sdlc\)\n\nImportant: 1 · Nit: 0 · Pre-existing: 0\n/);
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

  const gh = project({ tracker: { provider: 'github', repo: 'acme/app' } });
  const alias = await sdlc(gh, ['ci', 'tracker-merged'], { GH_TOKEN: 'g', GITHUB_API_URL: 'http://127.0.0.1:9', MERGED_BRANCH: 'change/issue-31-x', HEAD_REF: 'main' });
  assert.equal(alias.code, 0);
  assert.match(alias.err, /could not transition #31/);
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

  const quota = stubLog();
  const out = join(mkdtempSync(join(tmpdir(), 'sdlc-evals-')), 'evals.json');
  const refused = await sdlc(root, ['ci', 'evals', '--out', out], { STUB_LOG: quota, STUB_ACCOUNT_ERROR: 'Quota exceeded. Check your plan and billing details.', EVAL_MIN_PASS_RATE: '0' });
  assert.equal(refused.code, 1, 'not a pass, even with no minimum');
  assert.equal(read(quota).trim().split('\n').length, 1, 'stops at the first refusal instead of running every case');
  assert.match(refused.out, /evals not run: claude: the provider refused the account \(ERROR: Quota exceeded\. Check your plan and billing details\.\); check the API key and its plan or billing\. This is not an agent result/);
  assert.doesNotMatch(refused.out, /pass rate/);
  assert.match(JSON.parse(read(out)).error, /refused the account/);
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

test('ci scorecard: a run stopped by a refused account does not change the scorecard', async () => {
  const root = project({});
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-reports-'));
  const result = [{ name: 'py-intent', passed: true, failures: [] }];
  writeFileSync(join(dir, 'claude.json'), JSON.stringify({ agent: 'claude', rate: 1, min: 0.8, date: '2026-11-09', results: result }));
  writeFileSync(join(dir, 'codex.json'), JSON.stringify({ agent: 'codex', rate: 0, min: 0.8, date: '2026-11-09', error: 'codex: the provider refused the account', results: [{ ...result[0], passed: false }] }));
  const out = join(root, 'scorecard.md');
  writeFileSync(out, '# Agent scorecard\n');
  const r = await sdlc(root, ['ci', 'scorecard', join(dir, 'claude.json'), join(dir, 'codex.json'), '--out', 'scorecard.md']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /skipped codex: codex: the provider refused the account/);
  assert.match(read(out), /Claude Code/);
  assert.doesNotMatch(read(out), /Codex/);
});
