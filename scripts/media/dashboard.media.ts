// Records the dashboard part of the tutorial (video + screenshots) on the tutorial repo with the plan waiting
// for approval. Run through scripts/media/build.sh (playwright test -c scripts/media/playwright.config.ts).
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const MEDIA = import.meta.dirname;
const OUT = resolve(process.env.MEDIA_OUT ?? join(tmpdir(), 'sdlc-media'));
const CLI = resolve(MEDIA, '../../packages/cli/dist/sdlc.mjs');
const pause = (_page: import('@playwright/test').Page, ms: number) => new Promise((ok) => setTimeout(ok, ms));

for (const loc of ['en', 'es'] as const) {
  test.describe(`dashboard-${loc}`, () => {
    let url = '';
    let proc: ChildProcess | undefined;

    // outside the test, so the video starts on the dashboard and not on a blank page while the repo is prepared
    test.beforeAll(async () => {
      const root = join(mkdtempSync(join(tmpdir(), `sdlc-media-${loc}-`)), 'my-todo');
      execFileSync('bash', ['-c', `source "${MEDIA}/tutorial.sh" && tut_repo "${root}" && tut_install && tut_quick && tut_loop approve-plan`], {
        env: { ...process.env, DEMO_LOCALE: loc, SDLC_BIN: process.env.SDLC_BIN ?? `node ${CLI}` },
        stdio: 'ignore',
      });
      const p = spawn(process.execPath, [CLI, 'ui', '--port', '0', '--no-open'], {
        cwd: root,
        env: { ...process.env, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'sdlc-media-home-')), SDLC_PROJECT_DIR: root },
      });
      proc = p;
      url = await new Promise<string>((ok, fail) => {
        let out = '';
        const timer = setTimeout(() => fail(new Error(`sdlc ui did not start:\n${out}`)), 15_000);
        const read = (d: Buffer) => {
          out += d;
          const m = /sdlc dashboard: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out);
          if (m) clearTimeout(timer), ok(m[1]);
        };
        p.stdout.on('data', read);
        p.stderr.on('data', read);
      });
    });
    test.afterAll(() => void proc?.kill());

    test('record', async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      await page.goto(url);
      await expect(page.locator('.card').first()).toBeVisible();
      await pause(page, 2500);
      await page.screenshot({ path: join(OUT, `dashboard-board-${loc}.png`) });

      await page.goto(`${url}#/inbox`);
      const item = page.locator('.inbox li').first();
      await expect(item).toContainText('plan.md');
      await pause(page, 2000);
      await page.screenshot({ path: join(OUT, `dashboard-inbox-${loc}.png`) });

      await item.locator('a').click();
      await expect(page.locator('.change > h1')).toBeVisible();
      await pause(page, 2500);
      await page.mouse.wheel(0, 400);
      await pause(page, 1500);
      await page.locator('button.primary').click();
      await expect(page.locator('.gate-msg')).toBeVisible();
      await pause(page, 2500);

      await page.goto(url);
      await expect(page.locator('.card').first()).toBeVisible();
      await pause(page, 2500);
    });
  });
}
