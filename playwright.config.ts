import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', timeout: 45000, workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { channel: 'chrome', viewport: { width: 1280, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev:client', url: 'http://localhost:5173/castleofthebreakingwinds/', reuseExistingServer: true, timeout: 20000 },
});
