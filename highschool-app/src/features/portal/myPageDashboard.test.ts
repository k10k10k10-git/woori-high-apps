import { describe, expect, it } from "vitest";
import type { MinistryRoles } from "./accessPolicy";
import {
  applicationAttendanceSummary,
  canSeeCalendarKind,
  findUniqueApplicationAssignment,
  ministryModulesFor,
  roleDashboardTitle,
  summarizeNewFriends,
} from "./myPageDashboard";
import type { Application, NewFriend, Session } from "@/features/semester/types";

const roles = (semester: MinistryRoles["semester"], retreat: MinistryRoles["retreat"]): MinistryRoles => ({ semester, retreat });

describe("역할별 마이페이지 읽기 모델", () => {
  it.each([
    [roles("pastor", "pastor"), ["semester", "sunday-all", "retreat-admin", "retreat-field", "guide"]],
    [roles("barnabas", "none"), ["semester", "sunday-barnabas", "guide"]],
    [roles("worship", "fieldStaff"), ["semester", "sunday-worship", "retreat-field", "guide"]],
    [roles("none", "iguardTeam"), ["retreat-admin", "retreat-field", "guide"]],
    [roles("none", "none"), ["guide"]],
  ])("권한 조합 %o에 허용된 모듈만 제공한다", (input, ids) => {
    expect(ministryModulesFor(input as MinistryRoles).map((item) => item.id)).toEqual(ids);
  });

  it("역할에 맞는 대시보드 문구를 선택한다", () => {
    expect(roleDashboardTitle(roles("barnabas", "none"))).toContain("새친구");
    expect(roleDashboardTitle(roles("none", "fieldStaff"))).toContain("현장 배정");
  });

  it("공유 일정도 역할이 열 수 있는 도메인만 노출한다", () => {
    const fieldOnly = roles("none", "fieldStaff");
    expect(canSeeCalendarKind("field", fieldOnly)).toBe(true);
    expect(canSeeCalendarKind("semester", fieldOnly)).toBe(false);
    expect(canSeeCalendarKind("retreat", fieldOnly)).toBe(false);
    const barnabas = roles("barnabas", "none");
    expect(canSeeCalendarKind("semester", barnabas)).toBe(true);
    expect(canSeeCalendarKind("sunday", barnabas)).toBe(true);
    expect(canSeeCalendarKind("field", barnabas)).toBe(false);
  });

  it("현재 신청 이름 후보가 정확히 한 명일 때만 내 배정으로 연결한다", () => {
    const base: Application = {
      id: "1_staff-a", studentId: "staff-a", bu: "스탭", grade: 0, class: 0,
      name: "김성훈", status: "배치", teamId: "team-a", trainingClassId: "training-a", createdAt: "2026-08-01",
    };
    expect(findUniqueApplicationAssignment(
      [base],
      [{ id: "team-a", name: "예배팀", color: "bg-blue-100", order: 1 }],
      [{ id: "training-a", name: "주일반", color: "bg-amber-100", order: 1 }],
      ["김성훈"],
    )).toMatchObject({ team: { name: "예배팀" }, trainingClass: { name: "주일반" } });
    expect(findUniqueApplicationAssignment([base, { ...base, id: "1_staff-b", studentId: "staff-b" }], [], [], ["김성훈"])).toBeNull();
  });

  it("휴강을 분모에서 제외해 개인 출석 요약을 계산한다", () => {
    const sessions: Session[] = [
      { id: "a", date: "2026-08-01", type: "정규" },
      { id: "b", date: "2026-08-08", type: "정규" },
      { id: "c", date: "2026-08-15", type: "휴강" },
    ];
    expect(applicationAttendanceSummary("app", sessions, {
      a: { app: { s: "출석" } }, b: { app: { s: "지각" } }, c: { app: { s: "결석" } },
    })).toEqual({ attended: 1, late: 1, absent: 0, recorded: 2, total: 2, rate: 75 });
  });

  it("현재 연도 새친구의 처리 단계를 집계한다", () => {
    const friend = (id: string, patch: Partial<NewFriend> = {}) => ({
      id, storageSid: "2026-sunday", name: id, part: "1부" as const, grade: 1,
      decision: "미정" as const, createdAt: "2026-08-01", ...patch,
    });
    expect(summarizeNewFriends([
      friend("접수"),
      friend("배정", { decision: "등록" }),
      friend("반영", { decision: "등록", assignedClassKey: "1-1-1" }),
      friend("완료", { giftDate: "2026-08-16" }),
      { ...friend("과거"), storageSid: "2025-sunday" },
    ], 2026)).toEqual({ total: 4, active: 3, classPending: 1, rosterPending: 1, completed: 1 });
  });
});
