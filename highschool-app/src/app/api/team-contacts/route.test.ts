import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  actor: { roles: { semester: "praise", retreat: "none" }, teamMemberships: { praise: { role: "staff", active: true, semesters: { "2026-2": true } } } },
  data: {} as Record<string, unknown>,
}));
vi.mock("@/features/praise/server/httpAuth", () => ({ authenticatePraiseRequest: async () => mocks.actor }));
vi.mock("@/features/praise/server/supabaseAdmin", () => ({
  getPraiseAdmin: () => ({ database: { get: async (path: string) => mocks.data[path] ?? null } }),
  PraiseRequestError: class PraiseRequestError extends Error {},
  praiseUnavailable: () => new Error("조회 오류"),
}));
import { GET } from "./route";

beforeEach(() => {
  mocks.data = {
    "semesters/2026-2/teams": { praise: { name: "찬양팀", teamKey: "praise" }, media: { name: "미디어팀", teamKey: "media" } },
    "semesters/2026-2/applications": {
      "1_s1": { name: "찬양 학생", bu: "1부", studentId: "s1", teamId: "praise", status: "배치" },
      "1_s2": { name: "다른 팀", bu: "1부", studentId: "s2", teamId: "media", status: "배치" },
    },
    "classes/2026": { "1-1-1": { students: { s1: { name: "찬양 학생", phone: "111" }, s2: { name: "다른 팀", phone: "222" } } } },
    "teacherStaff/2026": {},
  };
});

describe("담당 팀 공식 연락처 API", () => {
  it("자기 팀에 배치된 신청자의 연락처만 반환한다", async () => {
    const response = await GET(new Request("https://example.test/api/team-contacts?semesterId=2026-2&teamKey=praise"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contacts: { "1_s1": { phone: "111" } } });
  });
  it("다른 팀과 학기 범위는 비워서 반환한다", async () => {
    for (const query of ["semesterId=2026-2&teamKey=media", "semesterId=2026-1&teamKey=praise"]) {
      const response = await GET(new Request(`https://example.test/api/team-contacts?${query}`));
      expect(await response.json()).toEqual({ contacts: {} });
    }
  });
});
