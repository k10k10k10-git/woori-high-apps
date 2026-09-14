import { describe, expect, it } from "vitest";
import { canAdministerPraise, praisePermissions } from "./permissions";
import type { PraiseActor, PraiseState } from "./types";

const actor = (role: "leader" | "operator" | "staff" | "viewer", team: "praise" | "media" = "praise"): PraiseActor => ({
  uid: `${team}-${role}`,
  roles: { semester: role === "leader" ? "leader" : "staff", retreat: "none" },
  teamMemberships: { [team]: { role, active: true } },
});

describe("찬양팀 서버 권한", () => {
  it("찬양팀 팀장과 운영자만 전역 관리 권한을 갖는다", () => {
    expect(canAdministerPraise(actor("leader"))).toBe(true);
    expect(canAdministerPraise(actor("operator"))).toBe(true);
    expect(canAdministerPraise(actor("staff"))).toBe(false);
    expect(canAdministerPraise(actor("leader", "media"))).toBe(false);
  });

  it("찬양팀 조회자는 읽기만 가능하다", () => {
    expect(praisePermissions(actor("viewer"))).toMatchObject({ read: true, manage: false, stageEdit: false });
  });

  it("학기 범위가 있는 담당자는 지정된 찬양 학기만 관리한다", () => {
    const scoped = actor("leader");
    scoped.teamMemberships.praise!.semesters = { "2026-2": true };
    expect(canAdministerPraise(scoped, "2026-2")).toBe(true);
    expect(canAdministerPraise(scoped, "2026-1")).toBe(false);
    expect(praisePermissions(scoped, { meta: { semesterId: "2026-1" }, access: {} } as PraiseState).read).toBe(false);
  });
});
