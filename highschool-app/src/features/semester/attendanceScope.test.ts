import { describe, expect, it } from "vitest";
import { paths } from "./paths";

describe("학기 출석 경로 분리", () => {
  it("사역팀과 훈련 출석을 서로 다른 하위 경로에 저장한다", () => {
    expect(paths.attendanceEntry("2026-2", "team", "session-1", "app-1"))
      .toBe("semesters/2026-2/attendance/team/session-1/app-1");
    expect(paths.attendanceEntry("2026-2", "training", "session-1", "app-1"))
      .toBe("semesters/2026-2/attendance/training/session-1/app-1");
  });

  it("기존 사역팀 전체 경로는 유지한다", () => {
    expect(paths.attendanceByScope("2026-2", "team"))
      .toBe("semesters/2026-2/attendance/team");
  });
});
