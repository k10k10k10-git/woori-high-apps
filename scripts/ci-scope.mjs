import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const full = (reason, deploy = true) => ({ quality: "full", staff: true, finance: true, deploy, reason });
const staffSpecs = new Set([
  "new-staff-local.e2e.ts", "account-search-local.e2e.ts",
  "retreat-flow-local.e2e.ts", "meetings-local.e2e.ts",
].map((name) => `highschool-app/e2e/${name}`));
const runGit = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

// 좁은 허용 목록만 줄인다. 허용 목록 밖 경로·공통 코드·인증·저장·권한은 기본 전체 검사다.
export function classify(paths) {
  if (!paths.length) return full("변경 목록 없음: 전체 검사");
  const deploy = paths.some((path) => path.startsWith("highschool-app/"));
  let quality = "none", staff = false, finance = false;
  for (const path of paths) {
    if (!path || path.startsWith("/") || path.split("/").includes("..")) return full("알 수 없는 경로");
    if (/^(?:[^/]+\.md|docs\/.+\.md|highschool-app\/(?:[^/]+\.md|docs\/.+\.md|\.impeccable\/critique\/.+\.md))$/.test(path)) continue;
    if (path === ".claude/HANDOFF.md") continue;
    if (path.startsWith("agent-os/")) continue;
    // 학생 앱 실행 코드는 별도 CI가 담당한다. 두 앱이 공유하는 Rules는 전체 검사다.
    if (path.startsWith("attendance-app/") && path !== "attendance-app/database.rules.json") continue;
    if (/^\.github\/workflows\/(?:agent-os-security|attendance-browser|attendance-quality)\.yml$/.test(path)) continue;
    quality = "core";
    if (/^highschool-app\/src\/.+\.(?:test|render\.test)\.tsx?$/.test(path)) continue;
    if (staffSpecs.has(path)) { staff = true; continue; }
    if (path === "highschool-app/e2e/admin-finance-local.e2e.ts") { finance = true; continue; }
    // CSS Module도 전역 선택자를 포함할 수 있으므로 두 UI 묶음을 모두 확인한다.
    if (/^highschool-app\/src\/.+\.module\.css$/.test(path)) { staff = finance = true; continue; }
    return full(`전체 검사 경로: ${path}`, deploy);
  }
  return { quality, staff, finance, deploy, reason: quality === "none" ? "문서 또는 독립 로컬 도구" : "테스트 또는 모듈 스타일만 변경" };
}

export function eventScope(eventName, event, git = runGit) {
  try {
    let base, head;
    if (eventName === "pull_request") {
      base = event.pull_request?.base?.sha;
      head = event.pull_request?.head?.sha;
      if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ""))) return full("PR SHA 없음");
      base = git(["merge-base", base, head]).trim();
    } else if (eventName === "push") {
      base = event.before;
      head = event.after;
    } else return full("수동·merge queue·알 수 없는 이벤트");
    if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? "") && !/^0+$/.test(sha))) return full("비교 SHA 없음");
    // rename을 삭제+추가로 받아 이전의 민감 경로도 검사한다. 파일 개수 제한 없이 NUL로 구분한다.
    const paths = git(["diff", "--name-only", "--no-renames", "-z", base, head, "--"]).split("\0").filter(Boolean);
    return classify(paths);
  } catch {
    return full("git 비교 실패: 전체 검사");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let scope, comparison;
  try {
    scope = eventScope(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")), (args) => {
      const output = runGit(args);
      if (args[0] === "diff") comparison = args.slice(4);
      return output;
    });
  } catch { scope = full("이벤트 읽기 실패: 전체 검사"); }
  // 비교에 성공한 범위 전체를 검사한다. 형식 오류는 전체 검사 fallback으로 숨기지 않는다.
  if (comparison) execFileSync("git", ["diff", "--check", ...comparison], { stdio: "inherit" });
  console.log(JSON.stringify(scope, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(scope).filter(([key]) => key !== "reason").map(([key, value]) => `${key}=${value}\n`).join(""));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `검사 범위: quality=${scope.quality}, staff=${scope.staff}, finance=${scope.finance}, deploy=${scope.deploy}\n\n${scope.reason}\n`);
}
