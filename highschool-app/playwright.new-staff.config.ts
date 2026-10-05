import { defineConfig, devices } from "@playwright/test";

// 합성 테스트는 운영 기본 config와 인증 storageState를 사용하지 않는다.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "new-staff-local.e2e.ts",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "./test-results/new-staff-local",
  use: {
    baseURL: "http://127.0.0.1:4179",
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile390", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "mobile-webkit390", use: { ...devices["iPhone 15"], browserName: "webkit", viewport: { width: 390, height: 844 } } },
    { name: "tablet768", use: { browserName: "chromium", viewport: { width: 768, height: 1024 } } },
    { name: "wide1280", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "node e2e/fixtures/new-staff/start.mjs",
    url: "http://127.0.0.1:4179/__qa__/proof.json",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
