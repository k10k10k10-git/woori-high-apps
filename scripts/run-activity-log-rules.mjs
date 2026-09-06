import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { rulesWithActivityLogProposal } from "./activity-log-rules-proposal.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "woori-activity-log-rules-"));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
try {
  const source = JSON.parse(await readFile(join(root, "attendance-app/database.rules.json"), "utf8"));
  const candidate = source.rules.activityLogs ? source : rulesWithActivityLogProposal(source);
  await writeFile(join(temporary, "rules.json"), JSON.stringify(candidate, null, 2));
  await writeFile(join(temporary, "firebase.json"), JSON.stringify({
    database: { rules: "rules.json" },
    emulators: { database: { host: "127.0.0.1", port: 19006 }, ui: { enabled: false } },
  }));
  const result = spawnSync("firebase", ["emulators:exec", "--only", "database", "--project", "demo-activity-log", "--config", join(temporary, "firebase.json"),
    `${quote(process.execPath)} ${quote(join(root, "scripts/test-activity-log-rules.mjs"))}`], {
    cwd: temporary, env: process.env, stdio: "inherit", shell: false,
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
