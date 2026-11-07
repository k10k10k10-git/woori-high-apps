import { describe, expect, it } from "vitest";
import {
  accessibleTeamKeys,
  describeTeamRoles,
  canAccessOperationsCenter,
  canAccessTeam,
  canBrowseTeam,
  canEditTeam,
  canReadSemesterPrivate,
  canReadTeamContacts,
  mergeTeamMemberships,
  normalizeTeamMemberships,
  ownTeamKey,
  semesterTeamForKey,
} from "./teamModel";

const leader = { semester: "leader", retreat: "leader" } as const;

describe("teamModel", () => {
  it("명시된 활성 팀만 소속으로 인정한다", () => {
    const memberships = normalizeTeamMemberships({
      media: { role: "leader", active: true },
      praise: { role: "staff", active: false },
      unknown: { role: "leader", active: true },
    });
    expect(accessibleTeamKeys(leader, memberships)).toHaveLength(6);
    expect(ownTeamKey(leader, memberships)).toBe("media");
    expect(canEditTeam("media", leader, memberships)).toBe(true);
    expect(canEditTeam("praise", leader, memberships)).toBe(false);
  });

  it("조회자는 담당 팀을 볼 수 있지만 수정하지 못한다", () => {
    const memberships = normalizeTeamMemberships({ praise: { role: "viewer", active: true } });
    expect(accessibleTeamKeys(leader, memberships)).toHaveLength(6);
    expect(canEditTeam("praise", leader, memberships)).toBe(false);
  });

  it("두 계정 원장에 나뉜 팀 연결을 하나도 잃지 않고 합친다", () => {
    expect(mergeTeamMemberships(
      { media: { role: "leader", active: true } },
      { praise: { role: "staff", active: true } },
    )).toEqual({
      media: { role: "leader", active: true },
      praise: { role: "staff", active: true },
    });
  });

  it("학기가 지정된 팀 연결은 해당 학기에서만 조회·수정한다", () => {
    const memberships = normalizeTeamMemberships({
      praise: { role: "leader", active: true, semesters: { "2026-2": true } },
    });
    expect(canAccessTeam("praise", leader, memberships, "2026-2")).toBe(true);
    expect(canEditTeam("praise", leader, memberships, "2026-2")).toBe(true);
    expect(canAccessTeam("praise", leader, memberships, "2026-1")).toBe(false);
    expect(canBrowseTeam("praise", leader, memberships, "2026-1")).toBe(true);
    expect(canEditTeam("praise", leader, memberships, "2026-1")).toBe(false);
  });

  it("학기 동적 팀 ID를 저장된 키 또는 이전 이름으로 연결한다", () => {
    const teams = [
      { id: "dynamic-1", name: "찬양팀", color: "", order: 0 },
      { id: "dynamic-2", name: "이름 변경", teamKey: "media", color: "", order: 1 },
    ] as const;
    expect(semesterTeamForKey(teams, "praise")?.id).toBe("dynamic-1");
    expect(semesterTeamForKey(teams, "media")?.id).toBe("dynamic-2");
  });

  it("팀이 연결된 팀장은 중앙 운영 대신 자기 팀 공간을 사용한다", () => {
    const memberships = normalizeTeamMemberships({ media: { role: "leader", active: true } });
    expect(canAccessOperationsCenter(leader, memberships)).toBe(false);
    expect(canAccessOperationsCenter({ semester: "adminTeam", retreat: "none" }, memberships)).toBe(true);
    expect(canAccessOperationsCenter({ semester: "superAdmin", retreat: "none" }, memberships)).toBe(true);
  });

  it("교역자·행정팀은 운영센터와 학기 비공개 연락처를 함께 읽는다", () => {
    const memberships = normalizeTeamMemberships({ media: { role: "staff", active: true } });
    for (const semester of ["pastor", "adminTeam", "superAdmin"] as const) {
      const roles = { semester, retreat: "none" } as const;
      expect(canAccessOperationsCenter(roles, memberships)).toBe(true);
      expect(canReadSemesterPrivate(roles, memberships)).toBe(true);
    }
    expect(canReadSemesterPrivate(leader, memberships)).toBe(false);
  });

  it("팀장과 일반 팀원은 조회 가능한 팀의 공식 원장 연락처를 읽는다", () => {
    const memberships = normalizeTeamMemberships({ praise: { role: "staff", active: true } });
    const member = { semester: "praise", retreat: "none" } as const;
    expect(canReadTeamContacts("praise", member, memberships)).toBe(true);
    expect(canReadTeamContacts("media", member, memberships)).toBe(false);
    expect(canReadTeamContacts("media", leader, memberships)).toBe(true);
    expect(canReadSemesterPrivate(member, memberships)).toBe(false);
  });
});


it("홈과 개인 화면은 활성 팀과 실제 소속 역할을 표시하고 방학 역할도 보존한다", () => {
  const member = { semester: "staff", retreat: "fieldStaff" } as const;
  expect(describeTeamRoles(member, { praise: { role: "staff", active: true }, media: { role: "viewer", active: false } })).toBe("학기 찬양팀 스탭 · 방학 현장 스탭");
  expect(describeTeamRoles({ ...member, retreat: "none" }, { praise: { role: "viewer", active: true }, media: { role: "leader", active: true } })).toBe("학기 찬양팀 조회자 · 미디어팀 팀장");
  expect(describeTeamRoles({ semester: "leader", retreat: "none" }, { praise: { role: "leader", active: true } })).toBe("학기 찬양팀 팀장");
});

it("중앙 운영 역할과 소속 없는 계정의 기존 역할 설명은 유지한다", () => {
  for (const semester of ["superAdmin", "pastor", "adminTeam"] as const) {
    const names = { superAdmin: "통합관리자", pastor: "교역자", adminTeam: "행정팀" };
    expect(describeTeamRoles({ semester, retreat: "none" }, { praise: { role: "staff", active: true } })).toBe(`학기 ${names[semester]}`);
  }
  expect(describeTeamRoles({ semester: "staff", retreat: "none" }, { praise: { role: "staff", active: false } })).toBe("학기 사역팀(미지정)");
  expect(describeTeamRoles({ semester: "praise", retreat: "none" })).toBe("학기 찬양팀");
});

it("행정팀은 별도 바나바 소속 없이 새친구 업무에 접근·수정한다", () => {
  const roles = { semester: "adminTeam", retreat: "none" } as const;
  for (const memberships of [{}, { admin: { active: true, role: "staff" as const } }, { barnabas: { active: true, role: "viewer" as const } }]) {
    expect(accessibleTeamKeys(roles, memberships)).toEqual(["admin", "barnabas"]);
    expect(canBrowseTeam("barnabas", roles, memberships)).toBe(true);
    expect(canAccessTeam("barnabas", roles, memberships)).toBe(true);
    expect(canEditTeam("barnabas", roles, memberships)).toBe(true);
    expect(canEditTeam("worship", roles, memberships)).toBe(false);
    expect(canAccessTeam("praise", roles, memberships)).toBe(false);
  }
  expect(canEditTeam("barnabas", { semester: "staff", retreat: "adminTeam" })).toBe(false);
});
