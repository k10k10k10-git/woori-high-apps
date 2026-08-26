import { existsSync, statSync } from "node:fs";

const statePath = process.env.E2E_STORAGE_STATE;

if (!statePath || !existsSync(statePath) || statSync(statePath).size === 0) {
  console.error(
    "Authenticated E2E requires E2E_STORAGE_STATE to point to a non-empty Playwright storage-state file.",
  );
  process.exit(1);
}

console.log(`Authenticated E2E state is ready: ${statePath}`);
