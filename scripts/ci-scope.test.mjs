import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { classify, eventScope } from "./ci-scope.mjs";

const cases = [
  ["루트 문서", ["AGENTS.md", "CLAUDE.md", "docs/CI.md"], "none", false, false, false],
  ["앱 문서", ["highschool-app/CLAUDE.md"], "none", false, false, true],
  ["인수인계 문서", [".claude/HANDOFF.md"], "none", false, false, false],
  ["학생 앱", ["attendance-app/src/lib/db.ts"], "none", false, false, false],
  ["로컬 도구", ["agent-os/server.js"], "none", false, false, false],
  ["단위 검사", ["highschool-app/src/features/portal/accessPolicy.test.ts"], "core", false, false, true],
  ["렌더 검사", ["highschool-app/src/features/portal/MyPageModal.render.test.tsx"], "core", false, false, true],
  ["스탭 E2E", ["highschool-app/e2e/new-staff-local.e2e.ts"], "core", true, false, true],
  ["계정 검색 E2E", ["highschool-app/e2e/account-search-local.e2e.ts"], "core", true, false, true],
  ["회계 E2E", ["highschool-app/e2e/admin-finance-local.e2e.ts"], "core", false, true, true],
  ["모듈 스타일", ["highschool-app/src/features/portal/PortalHome.module.css"], "core", true, true, true],
  ["혼합 테스트", ["AGENTS.md", "highschool-app/e2e/admin-finance-local.e2e.ts", "highschool-app/e2e/meetings-local.e2e.ts"], "core", true, true, true],
];
for (const [label, paths, quality, staff, finance, deploy] of cases) {
  test(label, () => assert.deepEqual(
    (({ reason, ...scope }) => scope)(classify(paths)), { quality, staff, finance, deploy },
  ));
}
for (const path of [
  "highschool-app/src/context/AuthContext.tsx",
  "highschool-app/src/features/portal/accessPolicy.ts",
  "highschool-app/src/features/portal/roleAssign.ts",
  "highschool-app/src/features/semester/db.ts",
  "highschool-app/src/features/finance/client.ts",
  "highschool-app/src/features/finance/FinancePanel.tsx",
  "highschool-app/src/lib/db.ts",
  "highschool-app/src/features/portal/PortalHome.tsx",
  "highschool-app/src/app/globals.css",
  "highschool-app/package-lock.json",
  "highschool-app/next.config.ts",
  "highschool-app/playwright.admin-finance.config.ts",
  "highschool-app/e2e/fixtures/new-staff/mocks.tsx",
  "attendance-app/database.rules.json",
  ".github/workflows/highschool-quality.yml",
  "scripts/ci-scope.mjs", "scripts/ci-scope.test.mjs", "scripts/verify-all.mjs",
  "package.json", "new-app/index.ts", "docs/executable.mjs",
]) {
  test(`전체 검사: ${path}`, () => {
    const result = classify(["docs/CI.md", path]);
    assert.equal(result.quality, "full");
    assert.equal(result.staff, true);
    assert.equal(result.finance, true);
  });
}
test("빈 목록·이상 경로는 전체 검사", () => {
  for (const paths of [[], [""], ["../secret"], ["/tmp/file"], ["highschool-app/src/a\nb.ts"]]) {
    assert.equal(classify(paths).quality, "full");
  }
});
const base = "a".repeat(40), head = "b".repeat(40), ancestor = "c".repeat(40);
test("PR은 merge-base부터 head까지 전체 비교", () => {
  const calls = [];
  const result = eventScope("pull_request", { pull_request: { base: { sha: base }, head: { sha: head } } }, (args) => {
    calls.push(args);
    return calls.length === 1 ? `${ancestor}\n` : "highschool-app/e2e/admin-finance-local.e2e.ts\0";
  });
  assert.equal(result.finance, true);
  assert.equal(result.staff, false);
  assert.deepEqual(calls, [["merge-base", base, head], ["diff", "--name-only", "--no-renames", "-z", ancestor, head, "--"]]);
});
test("push는 직전 한 커밋 대신 before부터 after까지 비교", () => {
  eventScope("push", { before: base, after: head }, (args) => {
    assert.deepEqual(args, ["diff", "--name-only", "--no-renames", "-z", base, head, "--"]);
    return "docs/CI.md\0highschool-app/src/lib/db.ts\0";
  });
});
test("수동·merge queue·SHA 누락·0 SHA·git 오류는 전체 검사", () => {
  for (const [name, event] of [["workflow_dispatch", {}], ["merge_group", {}], ["other", {}], ["pull_request", {}], ["push", { before: "0".repeat(40), after: head }], ["push", { before: "--help", after: head }], ["push", { before: base, after: head }]]) {
    assert.equal(eventScope(name, event, () => { throw Error("git 실패"); }).quality, "full");
  }
});
test("실제 git: 민감 파일을 문서로 이름 변경해도 전체 검사, 300개 초과 변경 보존", () => {
  const dir = mkdtempSync(join(tmpdir(), "woori-ci-scope-"));
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    git(["init", "-q"]);
    git(["config", "user.name", "CI scope test"]);
    git(["config", "user.email", "ci-scope@example.invalid"]);
    writeFileSync(join(dir, "sensitive.ts"), "export const x = 1;\n");
    git(["add", "."]); git(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "base"]);
    const before = git(["rev-parse", "HEAD"]).trim();
    git(["mv", "sensitive.ts", "README.md"]);
    for (let i = 0; i < 305; i++) writeFileSync(join(dir, `doc-${i}.md`), "문서\n");
    git(["add", "."]); git(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "rename"]);
    const after = git(["rev-parse", "HEAD"]).trim();
    const paths = git(["diff", "--name-only", "--no-renames", "-z", before, after, "--"]).split("\0").filter(Boolean);
    assert.equal(paths.length, 307);
    assert.ok(paths.includes("sensitive.ts"));
    assert.equal(eventScope("push", { before, after }, git).quality, "full");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("워크플로: 필수 이름·실패 전파·전체 검사·인증 경계 보존", () => {
  const workflow = readFileSync(new URL("../.github/workflows/highschool-quality.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf("permissions:")), /paths:|paths-ignore:/);
  for (const job of ["verify", "new-staff-ui"]) {
    assert.match(workflow, new RegExp(`  ${job}:\\n(?:    #[^\\n]*\\n)?    needs: changes\\n    if: always\\(\\)`));
  }
  assert.equal((workflow.match(/if: needs.changes.result != 'success'\n        run: exit 1/g) ?? []).length, 2);
  for (const command of ["npm run lint", "npm run typecheck", "npm run build", "node scripts/check-praise-runtime.mjs"]) {
    assert.ok(workflow.includes(`- run: ${command}\n        if: needs.changes.outputs.quality != 'none'`));
  }
  for (const command of ["npm run test:coverage", "npm run quality:lighthouse"]) {
    assert.ok(workflow.includes(`- run: ${command}\n        if: needs.changes.outputs.quality != 'none' && (github.event_name != 'push' || needs.changes.outputs.quality == 'full')`));
  }
  assert.ok(workflow.includes("- run: npm test\n        if: github.event_name == 'push' && needs.changes.outputs.quality == 'core'"));
  assert.ok(workflow.includes("- run: npm run test:e2e:new-staff\n        if: needs.changes.outputs.staff == 'true'"));
  assert.ok(workflow.includes("- run: npx playwright test --config=playwright.admin-finance.config.ts\n        if: needs.changes.outputs.finance == 'true'"));
  assert.match(workflow, /if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /node scripts\/require-e2e-auth.mjs/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /needs: \[changes, verify, new-staff-ui\]/);
  assert.doesNotMatch(workflow, /continue-on-error|pull_request_target/);
});

test("PR/main 유형별 실제 run 조건 회귀", () => {
  const workflow = readFileSync(new URL("../.github/workflows/highschool-quality.yml", import.meta.url), "utf8");
  const blocks = workflow.split(/^  ([a-z0-9-]+):\n/m);
  const jobs = Object.fromEntries(blocks.slice(1).flatMap((name, index, parts) => index % 2 === 0 ? [[name, parts[index + 1]]] : []));
  const commands = (job, scope, eventName) => [...jobs[job].matchAll(/      - run: ([^\n]+)\n(?:        if: ([^\n]+)\n)?/g)]
    .filter(([, , condition]) => !condition || Function("needs", "github", `return (${condition});`)(
      { changes: { result: "success", outputs: Object.fromEntries(Object.entries(scope).map(([key, value]) => [key, String(value)])) } },
      { event_name: eventName },
    )).map(([, command]) => command);
  for (const [label, paths, quality, staff, finance] of cases) {
    const scope = classify(paths);
    for (const eventName of ["pull_request", "push"]) {
      const verify = commands("verify", scope, eventName);
      const ui = commands("new-staff-ui", scope, eventName);
      assert.equal(verify.includes("npm ci"), quality !== "none", label);
      assert.equal(verify.includes("npm run build"), quality !== "none", label);
      assert.equal(verify.includes("node scripts/check-praise-runtime.mjs"), quality !== "none", label);
      assert.equal(verify.includes("npm run test:coverage"), quality !== "none" && eventName !== "push", label);
      assert.equal(verify.includes("npm run quality:lighthouse"), quality !== "none" && eventName !== "push", label);
      assert.equal(verify.includes("npm test"), quality === "core" && eventName === "push", label);
      assert.equal(ui.includes("npm run test:e2e:new-staff"), staff, label);
      assert.equal(ui.includes("npx playwright test --config=playwright.admin-finance.config.ts"), finance, label);
      assert.equal(ui.includes("npx playwright install --with-deps chromium webkit"), staff || finance, label);
    }
  }
  const full = classify(["highschool-app/src/lib/db.ts"]);
  for (const eventName of ["pull_request", "push", "workflow_dispatch", "merge_group"]) {
    const verify = commands("verify", full, eventName);
    assert.ok(verify.includes("npm run test:coverage"));
    assert.ok(verify.includes("npm run quality:lighthouse"));
    assert.ok(commands("new-staff-ui", full, eventName).includes("npm run test:e2e:new-staff"));
    assert.ok(commands("new-staff-ui", full, eventName).includes("npx playwright test --config=playwright.admin-finance.config.ts"));
  }
});

test("CLI: 실제 출력·이벤트 fallback·변경 범위 whitespace 실패 전파", () => {
  const dir = mkdtempSync(join(tmpdir(), "woori-ci-cli-"));
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const script = fileURLToPath(new URL("./ci-scope.mjs", import.meta.url));
  const eventFile = join(dir, "event.json"), output = join(dir, "output"), summary = join(dir, "summary");
  const cli = () => execFileSync(process.execPath, [script], { cwd: dir, encoding: "utf8", stdio: "pipe", env: {
    ...process.env, GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: eventFile,
    GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
  } });
  try {
    git(["init", "-q"]); git(["config", "user.name", "CI scope test"]); git(["config", "user.email", "ci-scope@example.invalid"]);
    writeFileSync(join(dir, "README.md"), "문서\n"); git(["add", "README.md"]); git(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "base"]);
    const before = git(["rev-parse", "HEAD"]).trim();
    writeFileSync(join(dir, "README.md"), "새 문서\n"); git(["add", "README.md"]); git(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "docs"]);
    writeFileSync(eventFile, JSON.stringify({ before, after: git(["rev-parse", "HEAD"]).trim() }));
    assert.equal(JSON.parse(cli()).quality, "none");
    assert.match(readFileSync(output, "utf8"), /^quality=none\nstaff=false\nfinance=false\ndeploy=false\n$/);
    writeFileSync(join(dir, "README.md"), "나쁜 형식  \n"); git(["add", "README.md"]); git(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "bad whitespace"]);
    writeFileSync(eventFile, JSON.stringify({ before, after: git(["rev-parse", "HEAD"]).trim() }));
    assert.throws(cli, (error) => error.status !== 0 && error.stdout.includes("trailing whitespace"));
    writeFileSync(eventFile, "잘못된 JSON");
    assert.equal(JSON.parse(cli()).quality, "full");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
