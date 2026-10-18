import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: ['mobile.spec.ts', 'shop.spec.ts', 'pace.spec.ts'], timeout: 60000, workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-mobile-report' }]],
  outputDir: 'test-results-mobile',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'android-chrome', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: { command: 'npm run dev:client', url: 'http://localhost:5173/castleofthebreakingwinds/', reuseExistingServer: true, timeout: 20000 },
});
