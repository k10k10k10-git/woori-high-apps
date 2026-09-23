import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  data: { "classes/2026": { "1-1-1": { teacher: "담임", students: { s1: { name: "학생", phone: "010" } } } } } as Record<string, unknown>,
  reads: [] as string[],
}));
vi.mock("@/features/praise/server/httpAuth", () => ({ authenticatePraiseRequest: async () => ({
  roles: { semester: "barnabas", retreat: "none" },
  teamMemberships: { barnabas: { role: "staff", active: true, semesters: { "2026-2": true } } },
}) }));
vi.mock("@/features/praise/server/firebaseAdmin", () => ({
  getPraiseFirebaseAdmin: () => ({ database: { ref: (path: string) => ({ get: async () => { mocks.reads.push(path); return { val: () => mocks.data[path] ?? null }; } }) } }),
  PraiseRequestError: class PraiseRequestError extends Error {},
  praiseUnavailable: () => new Error("조회 오류"),
}));
import { GET } from "./route";

describe("바나바 반 선택지 API", () => {
  it("배정된 학기에는 반·담임만 반환하고 학생 정보는 제외한다", async () => {
    mocks.reads = [];
    const response = await GET(new Request("https://example.test/api/class-options?semesterId=2026-2"));
    expect(await response.json()).toEqual({ classes: [{ classKey: "1-1-1", teacher: "담임", students: {} }] });
    expect(mocks.reads).toEqual(["classes/2026"]);
  });
  it("다른 학기 명단은 조회하지 않는다", async () => {
    mocks.reads = [];
    const response = await GET(new Request("https://example.test/api/class-options?semesterId=2026-1"));
    expect(await response.json()).toEqual({ classes: [] });
    expect(mocks.reads).toEqual([]);
  });
});
