import { defineConfig, devices } from '@playwright/test';

// Dashboard end-to-end: each test gets its own throwaway repo and `sdlc ui` server (tests/ui/fixtures.ts).
// Needs `npm run build` first: the server runs from packages/cli/dist with the built UI.
export default defineConfig({
  testDir: 'tests/ui',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
