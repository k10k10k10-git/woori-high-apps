/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraiseWeek } from "./PraiseWeek";
import { praiseFixture } from "./praiseTestFixtures";

afterEach(cleanup);
describe("이번 주 출결 집계의 확인 범위", () => {
  it("이관 확인 항목을 업무 설명으로 표시하고 알 수 없는 원문은 노출하지 않는다", () => {
    const view = praiseFixture(); view.meta.mode = "shadow";
    view.meta.importBlockers = ["historical_group_unresolved", "source_snapshot_unverified", "source_storage_incomplete", "synthetic_internal_detail"];
    render(<PraiseWeek view={view} meeting={view.meetings[0]} onTab={vi.fn()} />);
    expect(screen.getByText("과거 출석 당시의 조편성 확인이 필요합니다.")).toBeTruthy();
    expect(screen.getByText("기존 사이트의 입력 중단과 최종 기록 대조가 필요합니다.")).toBeTruthy();
    expect(screen.getByText("기존 업로드 파일 원본이 아직 전달되지 않았습니다.")).toBeTruthy();
    expect(screen.queryByText("synthetic_internal_detail")).toBeNull();
  });

  it("과거 조 미확인 회차에 현재 조를 표시하지 않는다", () => {
    const view = praiseFixture();
    view.meta.sourceAsOf = "2026-09-06T07:15:04Z";
    view.meetings[0].updatedBy = "supabase:imported";
    delete view.meetings[0].groupVersionId;
    render(<PraiseWeek view={view} meeting={view.meetings[0]} onTab={vi.fn()} />);
    expect(screen.getByText("과거 조 확인 필요")).toBeTruthy();
    expect(screen.queryByText(/개 조 · 확정/)).toBeNull();
  });

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
  it("공통 연결 확인이 필요한 기록은 미입력과 별도로 집계한다", () => {
    const view = praiseFixture(); view.meetings[0].linkedSessionId = "shared-session";
    view.attendance = { "meeting-1": { "student-1": { status: null, groupVersionId: "groups-1", revision: 0, updatedAt: 0, updatedBy: "" } } };
    view.attendanceSources = { "meeting-1": { "student-1": { source: "praise", mapping: "invalid", writable: false } } };
    render(<PraiseWeek view={view} meeting={view.meetings[0]} onTab={vi.fn()} />);
    expect(screen.getByText("출석 0명 · 미입력 1명 · 연결 확인 필요 1명")).toBeInTheDocument();
    cleanup();
    view.permissions = { ...view.permissions, manage: false, attendanceAll: false, stageEdit: false, role: "groupStaff" };
    render(<PraiseWeek view={view} meeting={view.meetings[0]} onTab={vi.fn()} />);
    expect(screen.getByText("출석 0명 · 미입력 0명 · 연결 확인 필요 1명")).toBeInTheDocument();
  });
});
