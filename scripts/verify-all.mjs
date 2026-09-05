import { spawnSync } from "node:child_process";

// 운영 앱 2개. semester-app·교사·스탭 출석부는 2026-08-12 제거됐다.
const apps = [
  "highschool-app",
  "attendance-app",
];
const tasks = ["lint", "typecheck", "test", "build"];

for (const app of apps) {
  for (const task of tasks) {
    console.log(`\n[verify] ${app}: npm run ${task}`);
    const result = spawnSync("npm", ["run", task], {
      cwd: new URL(`../${app}/`, import.meta.url),
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

console.log("\n[verify] agent-os: node --test");
const agentOs = spawnSync(process.execPath, ["--test"], {
  cwd: new URL("../agent-os/", import.meta.url),
  stdio: "inherit",
});
if (agentOs.status !== 0) process.exit(agentOs.status ?? 1);

console.log("\n[verify] all applications and Agent OS passed");
