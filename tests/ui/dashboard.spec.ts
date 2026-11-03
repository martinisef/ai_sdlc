import { execFileSync } from 'node:child_process';
import { CONFIG, expect, read, test } from './fixtures.ts';

const column = (page: import('@playwright/test').Page, name: string) => page.locator('section.col', { has: page.locator('h3', { hasText: name }) });

test('board: each change is in its stage column, with the next step on top', async ({ page, dashboard }) => {
  await page.goto(dashboard);
  await expect(column(page, 'Spec').locator('.card')).toHaveCount(1);
  await expect(column(page, 'Spec').locator('.card-title')).toHaveText('Claims export');
  await expect(column(page, 'Spec').locator('.wait')).toContainText('spec gate');
  // an approved plan on the default branch means the change landed
  await expect(column(page, 'Merged').locator('.card-title')).toHaveText('Health endpoint');
  await expect(column(page, 'Intent').locator('.card')).toHaveCount(0);
  await expect(page.locator('.next-bar')).toContainText('Next step');
  await expect(page.locator('.who')).toContainText('Ana Product');
});

test('inbox lists the gate I can decide; approving it moves the card and writes the artifact', async ({ page, dashboard, repo }) => {
  await page.goto(`${dashboard}#/inbox`);
  const item = page.locator('.inbox li', { hasText: 'Claims export' });
  await expect(item).toContainText('spec.md');
  await item.locator('a').click();

  await expect(page.locator('.change > h1')).toHaveText('Claims export');
  await expect(page.locator('.md strong')).toHaveText('CSV', { useInnerText: true });
  await expect(page.locator('.timeline li').first()).toContainText('seed changes');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.gate-msg')).toContainText('approved');
  expect(read(repo, 'changes/claims-export/spec.md')).toMatch(/status: approved/);

  // the card stays in Spec but no longer waits on a gate
  await page.goto(dashboard);
  const card = column(page, 'Spec').locator('.card', { hasText: 'Claims export' });
  await expect(card.locator('.card-foot')).toContainText('spec-approved');
  await expect(card.locator('.wait')).toHaveCount(0);
  await page.goto(`${dashboard}#/inbox`);
  await expect(page.locator('.inbox')).toContainText('Nothing waiting for you');
});

test('rejecting a gate with a comment', async ({ page, dashboard, repo }) => {
  await page.goto(`${dashboard}#/change/claims-export`);
  await page.getByPlaceholder('Comment (optional)').fill('Needs a column list');
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.locator('.gate-msg')).toContainText('rejected');
  expect(read(repo, 'changes/claims-export/spec.md')).toMatch(/status: rejected/);
  // the gate is a commit; the comment goes in its message
  expect(execFileSync('git', ['log', '-1', '--format=%B'], { cwd: repo, encoding: 'utf8' })).toContain('Needs a column list');
});

test('settings: invalid JSON config shows the issues; a valid edit previews a diff and saves', async ({ page, dashboard, repo }) => {
  await page.goto(`${dashboard}#/settings`);
  await page.getByRole('button', { name: 'Raw JSON' }).click();
  await page.locator('textarea.json').fill(JSON.stringify({ ...CONFIG, locale: 'fr' }));
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(page.locator('.issues li').first()).toContainText('locale');
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.getByRole('button', { name: 'Form' }).click();
  const appendOnly = page.locator('label.field', { hasText: 'Append-only paths' }).locator('textarea');
  await appendOnly.fill('db/migrate/**');
  await appendOnly.blur();
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await expect(page.locator('.diff .add').first()).toBeVisible();
  await expect(page.locator('.diff')).toContainText('db/migrate/**');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.actions')).toContainText('Saved and synced');
  expect(JSON.parse(read(repo, '.sdlc/config.json')).append_only_paths).toEqual(['db/migrate/**']);
});

test('switching the locale to Spanish translates the dashboard', async ({ page, dashboard }) => {
  await page.goto(`${dashboard}#/settings`);
  await page.locator('label.field', { hasText: 'Locale' }).locator('select').selectOption('es');
  await page.getByRole('button', { name: 'Preview changes' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('nav')).toContainText('Tablero');
  await expect(page.locator('nav')).toContainText('Configuración');
});

test('health, metrics and activity load', async ({ page, dashboard }) => {
  await page.goto(`${dashboard}#/health`);
  await expect(page.locator('main')).toContainText('config');
  await page.goto(`${dashboard}#/metrics`);
  await expect(page.locator('main')).toContainText('Changes by stage');
  await expect(page.locator('main')).toContainText('Waiting for a person');
  await expect(page.locator('main')).toContainText('Revert rate');
  await page.goto(`${dashboard}#/activity`);
  await expect(page.locator('main h2, main .empty, main table').first()).toBeVisible();
});
