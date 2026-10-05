import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const storageState = process.env.E2E_STORAGE_STATE;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  testIgnore: "**/new-staff-local.e2e.ts",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://woorihigh-app.vercel.app",
    storageState: storageState && existsSync(storageState) ? storageState : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  ],
});
