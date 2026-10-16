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
import type { TeamMemberships } from "@/features/teams/teamModel";

const roles = (semester: MinistryRoles["semester"], retreat: MinistryRoles["retreat"]): MinistryRoles => ({ semester, retreat });

describe("역할별 마이페이지 읽기 모델", () => {
  it.each([
    [roles("pastor", "pastor"), ["semester", "sunday-all", "retreat-admin", "retreat-field", "guide"]],
    [roles("barnabas", "none"), ["sunday-barnabas", "guide"]],
    [roles("worship", "fieldStaff"), ["sunday-worship", "retreat-field", "guide"]],
    [roles("none", "iguardTeam"), ["retreat-admin", "retreat-field", "guide"]],
    [roles("none", "none"), ["guide"]],
  ])("권한 조합 %o에 허용된 모듈만 제공한다", (input, ids) => {
    expect(ministryModulesFor(input as MinistryRoles).map((item) => item.id)).toEqual(ids);
  });

  it.each(["staff", "viewer"] as const)("일반 학기 역할도 활성 팀의 %s 소속으로 바로 이동한다", (role) => {
    const modules = ministryModulesFor(roles("staff", "none"), { praise: { role, active: true } });
    expect(modules.map((item) => item.id)).toEqual(["sunday-praise", "guide"]);
    expect(modules[0]).toMatchObject({ title: "찬양팀", href: "/teams/praise", accessLabel: role === "viewer" ? "조회" : "담당" });
  });

  it("여러 팀 소속은 팀 목록으로 연결하고 비활성 소속은 제외한다", () => {
    const memberships: TeamMemberships = {
      praise: { role: "viewer", active: true },
      media: { role: "viewer", active: true },
      design: { role: "leader", active: false },
    };
    expect(ministryModulesFor(roles("staff", "none"), memberships)).toMatchObject([
      { id: "sunday-all", href: "/teams", accessLabel: "조회" }, { id: "guide" },
    ]);
    expect(ministryModulesFor(roles("staff", "none"), { ...memberships, media: { role: "staff", active: true } })[0].accessLabel).toBe("운영");
    expect(ministryModulesFor(roles("staff", "none"), { ...memberships, media: { role: "viewer", active: false } })[0].id).toBe("sunday-praise");
  });

  it("명시 소속이 비었거나 비활성이면 이전 팀 역할만으로 팀 접근을 표시하지 않는다", () => {
    expect(ministryModulesFor(roles("staff", "none"), {}).map((item) => item.id)).toEqual(["guide"]);
    expect(ministryModulesFor(roles("praise", "none"), { praise: { role: "staff", active: false } }).map((item) => item.id)).toEqual(["guide"]);
  });

  it("활성 상태인 과거 학기 소속도 팀에서 허용된 기록을 찾을 수 있게 유지한다", () => {
    expect(ministryModulesFor(roles("staff", "none"), {
      praise: { role: "staff", active: true, semesters: { "2025-1": true } },
    })[0]).toMatchObject({ id: "sunday-praise", href: "/teams/praise" });
  });

  it("중앙 역할의 운영센터·전체 팀 조회와 팀장 소속의 집중 동선을 보존한다", () => {
    const memberships: TeamMemberships = { praise: { role: "staff", active: true } };
    for (const semester of ["superAdmin", "pastor"] as const) {
      for (const assigned of [{}, memberships]) {
        expect(ministryModulesFor(roles(semester, "none"), assigned)).toMatchObject([
          { id: "semester" }, { id: "sunday-all", href: "/teams" }, { id: "guide" },
        ]);
      }
    }
    expect(ministryModulesFor(roles("leader", "none"), {}).map((item) => item.id)).toEqual(["semester", "sunday-all", "guide"]);
    expect(ministryModulesFor(roles("leader", "none"), memberships).map((item) => item.id)).toEqual(["sunday-praise", "guide"]);
    expect(ministryModulesFor(roles("adminTeam", "none"), {}).map((item) => item.id)).toEqual(["semester", "guide"]);
    expect(ministryModulesFor(roles("adminTeam", "none"), memberships).map((item) => item.id)).toEqual(["semester", "sunday-praise", "guide"]);
  });

  it("역할에 맞는 대시보드 문구를 선택한다", () => {
    expect(roleDashboardTitle(roles("barnabas", "none"))).toContain("새친구");
    expect(roleDashboardTitle(roles("none", "fieldStaff"))).toContain("현장 배정");
  });

  it("공유 일정도 역할이 열 수 있는 도메인만 노출한다", () => {
    const fieldOnly = roles("none", "fieldStaff");
    expect(canSeeCalendarKind("main", fieldOnly)).toBe(true);
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

  it("휴강을 분모에서 제외하고 남은 지각 기록은 출석으로 계산한다", () => {
    const sessions: Session[] = [
      { id: "a", date: "2026-08-01", type: "정규" },
      { id: "b", date: "2026-08-08", type: "정규" },
      { id: "c", date: "2026-08-15", type: "휴강" },
    ];
    expect(applicationAttendanceSummary("app", sessions, {
      a: { app: { s: "출석" } }, b: { app: { s: "지각" } }, c: { app: { s: "결석" } },
    })).toEqual({ actualAttended: 2, attended: 1, late: 1, absent: 0, recorded: 2, unrecorded: 0, total: 2, rate: 100 });
  });

  it("실제 출석, 결석을 포함한 입력 완료, 미입력을 서로 구분한다", () => {
    const sessions: Session[] = [
      { id: "present", date: "2026-08-01", type: "정규" },
      { id: "absent", date: "2026-08-08", type: "정규" },
      { id: "unrecorded", date: "2026-08-15", type: "정규" },
    ];
    expect(applicationAttendanceSummary("app", sessions, {
      present: { app: { s: "출석" } },
      absent: { app: { s: "결석" } },
    })).toMatchObject({ actualAttended: 1, attended: 1, absent: 1, recorded: 2, unrecorded: 1, total: 3, rate: 33 });
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
