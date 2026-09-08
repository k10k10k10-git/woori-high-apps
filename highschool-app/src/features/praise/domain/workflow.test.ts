import { describe, expect, it } from "vitest";
import { praiseFixture } from "../components/praiseTestFixtures";
import { defaultPraiseMeeting, praiseAccountProgress, praiseAttendanceProgress } from "./workflow";

describe("주간 업무 추천의 확인 범위", () => {
  it("휴강을 건너뛰고 가까운 운영 회차를 추천하며 입력 목록을 정렬로 변형하지 않는다", () => {
    const meeting = praiseFixture().meetings[0];
    const meetings = [{ ...meeting, id: "next", date: "2026-09-19", worshipDate: "2026-09-20" }, { ...meeting, id: "cancelled", date: "2026-09-12", worshipDate: "2026-09-13", cancelled: true }, meeting];
    expect(defaultPraiseMeeting(meetings, "2026-09-08")?.id).toBe("next");
    expect(meetings[0].id).toBe("next");
    expect(defaultPraiseMeeting([], "2026-09-08")).toBeNull();
  });
  it("연결이 무효인 출석은 입력 완료로 세지 않는다", () => {
    const view = praiseFixture();
    view.attendance = { "meeting-1": { "student-1": { status: "PRESENT", groupVersionId: "groups-1", revision: 1, updatedAt: 1, updatedBy: "a" } } };
    view.attendanceSources = { "meeting-1": { "student-1": { source: "praise", mapping: "invalid", writable: false } } };
    expect(praiseAttendanceProgress(view, view.meetings[0])).toEqual({ total: 2, present: 0, absent: 0, missing: 1, unknown: 0, invalid: 1, complete: false });
  });
  it("비활성 계정과 중복 연결은 로그인 준비 완료를 늘리지 않는다", () => {
    const view = praiseFixture();
    const access = { uid: "u1", staffId: "staff-1", role: "groupStaff" as const, active: true, revision: 1, updatedAt: 1, updatedBy: "a" };
    view.access = [access, { ...access, uid: "u2" }, { ...access, uid: "u3", staffId: "staff-2", active: false }];
    expect(praiseAccountProgress(view)).toMatchObject({ total: 2, linked: 1, missing: [{ id: "staff-2" }] });
  });
});
