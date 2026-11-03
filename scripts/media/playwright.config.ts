import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Only for scripts/media/build.sh: records the dashboard, it does not test it (tests/ui does).
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: '*.media.ts',
  outputDir: join(resolve(process.env.MEDIA_OUT ?? join(tmpdir(), 'sdlc-media')), 'pw'),
  timeout: 120_000,
  workers: 1,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, video: { mode: 'on', size: { width: 1280, height: 720 } } },
});
