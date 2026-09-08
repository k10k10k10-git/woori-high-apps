import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { ref } = vi.hoisted(() => ({ ref: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({ getPraiseFirebaseAdmin: () => ({ database: { ref } }), praiseUnavailable: (code: string) => new Error(code) }));
import { praiseAccounts } from "./references";
beforeEach(() => vi.clearAllMocks());
it("담당 계정은 승인된 찬양 접근 계정만 반환하고 동명이인을 이메일로 구분한다", async () => {
  const nodes: Record<string, unknown> = { admins: {}, retreatAdmins: {}, iguardMembers: {
    one: { name: "같은이름", email: "one@example.com", semesterRole: "praise", retreatRole: "none" },
    two: { name: "같은이름", email: "two@example.com", semesterRole: "praise", retreatRole: "none" },
    blocked: { name: "권한없음", email: "private@example.com", semesterRole: "none", retreatRole: "iguardTeam" },
  }, iguardRoles: {} };
  ref.mockImplementation((path: string) => ({ get: async () => ({ val: () => nodes[path] }) }));
  const accounts = await praiseAccounts();
  expect(accounts.map((account) => account.email).sort()).toEqual(["one@example.com", "two@example.com"]);
  expect(accounts.some((account) => account.uid === "blocked")).toBe(false);
  expect(accounts.every((account) => Object.keys(account).every((key) => ["uid", "name", "email", "roleLabel"].includes(key)))).toBe(true);
});
it("계정 조회 실패는 빈 계정 목록으로 숨기지 않는다", async () => {
  ref.mockImplementation(() => ({ get: async () => { throw new Error("offline"); } }));
  await expect(praiseAccounts()).rejects.toThrow("reference_unavailable");
});
