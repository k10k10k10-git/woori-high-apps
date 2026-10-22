import { defineConfig } from "@playwright/test";
import base from "./playwright.new-staff.config";

export default defineConfig({
  ...base,
  outputDir: "./test-results/remodel",
  webServer: {
    command: "node e2e/fixtures/new-staff/start.mjs",
    url: "http://127.0.0.1:4179/__qa__/proof.json",
    timeout: 30_000,
    reuseExistingServer: true,
  },
});
