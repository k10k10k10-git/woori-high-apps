import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), verify: vi.fn(), ref: vi.fn(), values: {} as Record<string, unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/praise/server/firebaseAdmin", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/praise/server/firebaseAdmin")>();
  return { ...original, getPraiseFirebaseAdmin: mocks.admin };
});

import { GET } from "./route";

const request = () => new Request("https://example.test/api/worship-seating-source?week=2026-08-16&service=1", {
  headers: { authorization: "Bearer signed-token" },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.values = {};
  mocks.verify.mockResolvedValue({ uid: "member", firebase: { sign_in_provider: "google.com" } });
  mocks.ref.mockImplementation((path: string) => ({ get: async () => ({ val: () => mocks.values[path] ?? null }) }));
  mocks.admin.mockReturnValue({ auth: { verifyIdToken: mocks.verify }, database: { ref: mocks.ref } });
});

describe("예배 자리 배치용 집계 API", () => {
  it("예배팀 권한이 없으면 원장 내용을 읽기 전에 거절한다", async () => {
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.ref).not.toHaveBeenCalledWith("classes/2026");
    expect(mocks.ref).not.toHaveBeenCalledWith("attendance/2026");
  });

  it("예배팀에는 반별 평균만 돌려주고 이름·연락처·개별 출결은 감춘다", async () => {
    mocks.values["retreatAdmins/member"] = {
      semesterRole: "worship", teamMemberships: { worship: { role: "staff", active: true } },
    };
    mocks.values["classes/2026"] = {
      "1-1-1": { students: { student: { name: "노출금지", phone: "010-9999-9999" } } },
    };
    mocks.values["attendance/2026"] = { "1-1-1": { student: { "7-1": "O" } } };
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ classKeys: ["1-1-1"], cellKeys: ["7-1"], averageByClass: { "1-1-1": 1 } });
    expect(JSON.stringify(body)).not.toMatch(/노출금지|010-9999-9999|student|"O"/);
  });
});
