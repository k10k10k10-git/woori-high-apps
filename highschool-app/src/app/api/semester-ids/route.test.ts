import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), ids: vi.fn() }));
vi.mock("@/features/praise/server/httpAuth", () => ({ authenticatePraiseRequest: mocks.authenticate }));
vi.mock("@/features/praise/server/references", () => ({ listSemesterIds: mocks.ids }));
import { PraiseRequestError } from "@/features/praise/server/firebaseAdmin";
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.ids.mockResolvedValue(["2026-2"]); });

it.each(["superAdmin", "pastor", "adminTeam", "leader", "staff", "praise", "barnabas"])("승인된 %s 계정에 ID만 제공한다", async (semester) => {
  mocks.authenticate.mockResolvedValue({ roles: { semester, retreat: "none" } });
  const response = await GET(new Request("https://example.test/api/semester-ids"));
  expect(await response.json()).toEqual({ ids: ["2026-2"] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Authorization");
});
it("방학 역할의 기존 학기 목록 조회도 유지한다", async () => {
  mocks.authenticate.mockResolvedValue({ roles: { semester: "none", retreat: "iguardTeam" } });
  expect((await GET(new Request("https://example.test/api/semester-ids"))).status).toBe(200);
});
it("비로그인·미승인 계정은 ID 탐색 전에 거부한다", async () => {
  mocks.authenticate.mockRejectedValueOnce(new PraiseRequestError(401, "로그인 필요", "unauthorized"));
  expect((await GET(new Request("https://example.test/api/semester-ids"))).status).toBe(401);
  mocks.authenticate.mockResolvedValue({ roles: { semester: "none", retreat: "none" } });
  expect((await GET(new Request("https://example.test/api/semester-ids"))).status).toBe(403);
  expect(mocks.ids).not.toHaveBeenCalled();
});
it("조회 장애를 빈 학기 목록으로 표시하지 않는다", async () => {
  mocks.authenticate.mockResolvedValue({ roles: { semester: "pastor", retreat: "none" } });
  mocks.ids.mockRejectedValue(new PraiseRequestError(503, "조회 실패", "reference_unavailable"));
  const response = await GET(new Request("https://example.test/api/semester-ids"));
  expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("ids");
});
