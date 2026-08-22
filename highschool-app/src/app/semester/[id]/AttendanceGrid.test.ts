import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attendanceMenuPosition } from "./attendanceGridPosition";

describe("출석 표 상태 메뉴 위치", () => {
  it("셀 아래 공간이 충분하면 바로 아래에 표시한다", () => {
    expect(attendanceMenuPosition(
      { left: 200, top: 100, right: 244, bottom: 136, width: 44 },
      { width: 800, height: 700 },
    )).toEqual({ left: 148, top: 140 });
  });

  it("화면 아래에서는 셀 위로 올리고 좌우 화면 밖으로 나가지 않는다", () => {
    expect(attendanceMenuPosition(
      { left: 760, top: 620, right: 804, bottom: 656, width: 44 },
      { width: 800, height: 700 },
    )).toEqual({ left: 644, top: 476 });
  });
});

describe("출석 상태 셀 밀도", () => {
  it("상태 배경이 셀 전체를 채우도록 전역 표 여백을 상태 셀에서 제거한다", () => {
    const source = readFileSync(join(process.cwd(), "src/app/semester/[id]/AttendanceGrid.tsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(source).toContain("semester-attendance-grid");
    expect(source).toContain("cell-action-grid");
    expect(source).toContain("attendance-status-cell");
    expect(source).toContain("attendance-status-button");
    expect(css).toContain("table.semester-attendance-grid tbody td.attendance-status-cell");
    expect(css).toContain("table.cell-action-grid tbody tr:hover");
    expect(css).toContain("padding: 0;");
    expect(css).toContain("padding-block: var(--table-cell-y);");
  });

  it("월별 머리글의 남는 폭과 관계없이 모든 회차 열을 같은 폭으로 고정한다", () => {
    const source = readFileSync(join(process.cwd(), "src/app/semester/[id]/AttendanceGrid.tsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/app/operations-tables.css"), "utf8");

    expect(source.match(/attendance-session-cell/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/attendance-name-cell/g)?.length).toBeGreaterThanOrEqual(2);
    expect(css).toContain(".semester-attendance-grid .attendance-name-cell { min-width: 142px; }");
    expect(css).toContain(".semester-attendance-grid .attendance-session-cell { width: 52px; min-width: 52px; max-width: 52px; }");
    expect(css).not.toContain(".semester-attendance-grid :where(th, td):nth-child(2)");
  });
});
