import base from "./playwright.new-staff.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({ ...base, testMatch: "admin-finance-local.e2e.ts", outputDir: "./test-results/admin-finance-local" });
