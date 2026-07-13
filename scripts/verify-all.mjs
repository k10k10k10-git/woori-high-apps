import { spawnSync } from "node:child_process";

const apps = [
  "retreat-app",
  "iguard-app",
  "semester-app",
  "고등부 학생 출석부",
  "고등부 교사·스탭 출석부",
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

console.log("\n[verify] all applications passed");
