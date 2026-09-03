import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const retreatDir = resolve(process.cwd(), "src/app/retreat/[id]");

describe("large component boundaries", () => {
  it.each([
    ["AutoAssignConfigPanel.tsx", "AutoAssignNamePickers"],
    ["ClassRosterTab.tsx", "classRosterModel"],
    ["RoomsTab.tsx", "RoomComponents"],
    ["GroupsTab.tsx", "GroupComponents"],
  ])("keeps %s as an orchestrator with an extracted boundary", (file, extractedImport) => {
    const source = readFileSync(resolve(retreatDir, file), "utf8");
    expect(source).toContain(extractedImport);
    expect(source.split("\n").length).toBeLessThan(1_000);
  });
});

// ════════════════════════════════════════════════════════════
// 전역 파일 크기 래칫 (2026-09-02 신설)
//
// 위 4개 테스트는 2026-08-27에 생겼지만 **네 파일만** 지켰다. 그 사이
// iguard/lib/db.ts(1,120줄)와 autoAssignUtils.ts(1,085줄)는 같은 상한을 넘겼는데
// 아무도 막지 않았다.
//
// 여기서는 즉시 분할을 강요하지 않는다 — 그건 별도 계획(/refactor-plan)의 일이고,
// 급하게 쪼개면 소유권 경계가 흐려질 위험이 더 크다. 대신 **래칫**을 건다:
//   · 새 파일은 1,000줄을 넘을 수 없다
//   · 이미 넘긴 파일은 아래 목록에 기록된 현재 크기보다 **커질 수 없다**
// 파일을 줄였다면 그 숫자를 내려 적어 래칫을 조인다. 올려 적는 것은 분할을
// 미루는 결정이므로, 그때는 커밋 메시지에 이유를 남긴다.
// ════════════════════════════════════════════════════════════

const DEFAULT_MAX_LINES = 1_000;

/** 상한을 이미 넘긴 파일과 그 시점의 크기. 사유 없이 추가하지 않는다. */
const RATCHET: Record<string, { max: number; why: string }> = {
  "src/features/iguard/lib/db.ts": {
    max: 1_120,
    why: "행정 노드 읽기 전용 영역과 이가드 쓰기 영역이 한 파일에서 주석으로 구분된다. 쪼개려면 소유권 경계를 먼저 설계해야 한다.",
  },
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(process.cwd(), rel)).isDirectory()) { out.push(...sourceFiles(rel)); continue; }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}

describe("파일 크기 래칫", () => {
  const files = sourceFiles("src");

  it("소스를 실제로 수집한다", () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it("상한을 넘긴 파일은 래칫 목록에 있는 것뿐이고, 기록된 크기보다 커지지 않는다", () => {
    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(join(process.cwd(), file), "utf8").split("\n").length;
      const entry = RATCHET[file];
      if (entry) {
        if (lines > entry.max) violations.push(`${file}: ${lines}줄 (래칫 ${entry.max}줄 초과)`);
      } else if (lines >= DEFAULT_MAX_LINES) {
        violations.push(`${file}: ${lines}줄 — 1,000줄 상한 초과. 분할하거나 사유와 함께 RATCHET에 등록할 것`);
      }
    }
    expect(violations, `\n${violations.join("\n")}\n`).toEqual([]);
  });

  it("래칫 목록에 죽은 항목이 없다 (분할 뒤 지우지 않은 예외)", () => {
    for (const [file, entry] of Object.entries(RATCHET)) {
      const lines = readFileSync(join(process.cwd(), file), "utf8").split("\n").length;
      expect(entry.why.length, `${file}의 예외 사유가 비어 있다`).toBeGreaterThan(20);
      expect(lines, `${file}이 ${lines}줄로 줄었다 — RATCHET에서 빼거나 max를 내릴 것`)
        .toBeGreaterThanOrEqual(DEFAULT_MAX_LINES);
    }
  });
});
