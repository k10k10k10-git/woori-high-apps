/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraiseWeek } from "./PraiseWeek";
import { praiseFixture } from "./praiseTestFixtures";

afterEach(cleanup);
describe("이번 주 출결 집계의 확인 범위", () => {
  it("비관리자에게 내려오지 않은 담당 학생의 기록을 미입력으로 단정하지 않는다", () => {
    const view = praiseFixture();
    view.permissions = { ...view.permissions, manage: false, attendanceAll: false, stageEdit: false, role: "groupStaff" };
    render(<PraiseWeek view={view} meeting={view.meetings[0]} onTab={vi.fn()} />);
    expect(screen.getByText("출석 0명 · 미입력 0명 · 확인 필요 1명")).toBeTruthy();
  });
  it("담당 범위의 명시 null과 관리자 전체 조회의 누락을 미입력으로 집계한다", () => {
    const view = praiseFixture();
    render(<PraiseWeek view={view} meeting={view.meetings[0]} onTab={vi.fn()} />);
    expect(screen.getByText("출석 0명 · 미입력 2명")).toBeTruthy();
    cleanup();
    view.permissions = { ...view.permissions, manage: false, attendanceAll: false, stageEdit: false, role: "groupStaff" };
    view.attendance = { "meeting-1": { "student-1": { status: null, groupVersionId: "groups-1", revision: 1, updatedAt: 1, updatedBy: "staff-1" } } };
    render(<PraiseWeek view={view} meeting={view.meetings[0]} onTab={vi.fn()} />);
    expect(screen.getByText("출석 0명 · 미입력 1명")).toBeTruthy();
  });
});
