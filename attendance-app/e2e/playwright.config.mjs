import { defineConfig, devices } from '../../highschool-app/node_modules/@playwright/test/index.mjs';
export default defineConfig({
  testDir: '.', testMatch: '*.browser.spec.mjs', workers: 1, retries: 0, timeout: 45000,
  reporter: [['list']], outputDir: '../../tmp/attendance-browser-results',
  use: { baseURL: 'http://127.0.0.1:3199', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } }],
  webServer: { command: 'node server.mjs', url: 'http://127.0.0.1:3199', reuseExistingServer: false },
});
