import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  actor: { roles: { semester: "none", retreat: "fieldStaff" } },
  data: {} as Record<string, unknown>,
}));
vi.mock("@/features/praise/server/httpAuth", () => ({ authenticatePraiseRequest: async () => mocks.actor }));
vi.mock("@/features/praise/server/firebaseAdmin", () => ({
  getPraiseFirebaseAdmin: () => ({ database: { ref: (path: string) => ({ get: async () => ({ val: () => mocks.data[path] ?? null }) }) } }),
  PraiseRequestError: class PraiseRequestError extends Error {},
  praiseUnavailable: () => new Error("조회 오류"),
}));
import { GET } from "./route";

beforeEach(() => {
  mocks.data = {
    "retreats/camp/year": 2026,
    "retreats/camp/participants": { p1: { name: "참가자", bu: "1부", grade: 1, class: 1, studentId: "s1" } },
    "classes/2026": { "1-1-1": { students: { s1: { name: "참가자", phone: "111" }, s2: { name: "불참자", phone: "222" } } } },
  };
});

describe("수련회 현장 학생 API", () => {
  it("수련회 참가자만 연간 명단에서 반환한다", async () => {
    const response = await GET(new Request("https://example.test/api/retreat-students?retreatId=camp"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.students["1_s1"]).toMatchObject({ id: "1_s1", name: "참가자", num: 0, grade: 1, class: 1, buNum: 1 });
    expect(body.students["1_s1"].phone).toBe("");
    expect(body.students["1_s1"].birth).toBe("");
    expect(body.students["1_s2"]).toBeUndefined();
    expect(Object.keys(body.classes)).toEqual(["1-1-1"]);
    expect(body.classes["1-1-1"].students.s1).toEqual(body.students["1_s1"]);
  });
  it("수련회 역할이 없는 계정에는 학생 정보를 제공하지 않는다", async () => {
    mocks.actor.roles.retreat = "none";
    const response = await GET(new Request("https://example.test/api/retreat-students?retreatId=camp"));
    expect(await response.json()).toEqual({ students: {} });
    mocks.actor.roles.retreat = "fieldStaff";
  });
});
