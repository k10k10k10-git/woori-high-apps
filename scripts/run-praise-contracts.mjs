import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "woori-praise-contracts-"));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
try {
  // 운영 Rules 원천 그대로 새 업무 경로의 직접 접근 차단을 검사한다. 배포는 하지 않는다.
  await writeFile(join(temporary, "rules.json"), await readFile(join(root, "attendance-app/database.rules.json")));
  await writeFile(join(temporary, "firebase.json"), JSON.stringify({database:{rules:"rules.json"},emulators:{database:{host:"127.0.0.1",port:19016},auth:{host:"127.0.0.1",port:19098},ui:{enabled:false}}}));
  const result = spawnSync("firebase", ["emulators:exec", "--only", "database,auth", "--project", "demo-praise", "--config", join(temporary,"firebase.json"),
    `${quote(process.execPath)} ${quote(join(root,"highschool-app/node_modules/vitest/vitest.mjs"))} run --root ${quote(join(root,"highschool-app"))} src/features/praise/server/contracts.integration.test.ts`],
    {cwd:temporary,env:{...process.env,PRAISE_CONTRACTS:"1"},stdio:"inherit",shell:false});
  process.exitCode=result.status??1;
} finally {await rm(temporary,{recursive:true,force:true});}
