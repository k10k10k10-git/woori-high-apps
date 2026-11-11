import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), verify: vi.fn(), get: vi.fn(), setPassword: vi.fn(), values: {} as Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/praise/server/supabaseAdmin", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/praise/server/supabaseAdmin")>(),
  getPraiseAdmin: mocks.admin,
}));
import { POST } from "./route";

const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://example.test/api/accounts/password", {
  method: "POST",
  headers: { Authorization: "Bearer user-token", "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks(); mocks.values = {};
  mocks.verify.mockResolvedValue({ uid: "legacy-admin", name: null, email: "admin@example.test", supabaseId: "sb-admin", anonymous: false, disabled: false });
  mocks.get.mockImplementation(async (path: string) => mocks.values[path] ?? null);
  mocks.setPassword.mockResolvedValue({ created: true });
  mocks.admin.mockReturnValue({ auth: { verifyAccessToken: mocks.verify, setPassword: mocks.setPassword }, database: { get: mocks.get } });
});

describe("관리자 비밀번호 정하기 API", () => {
  it("whoami 로 바꾼 uid 의 admins 가 true 일 때만 계정을 만들거나 비밀번호를 바꾼다", async () => {
    mocks.values["admins/legacy-admin"] = true;
    const response = await POST(request({ email: "Team01@WooriHigh.com", password: "abcd1234" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: true });
    expect(mocks.verify).toHaveBeenCalledWith("user-token");
    expect(mocks.get).toHaveBeenCalledWith("admins/legacy-admin");
    expect(mocks.setPassword).toHaveBeenCalledWith("team01@woorihigh.com", "abcd1234");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([["문자열 true", "true"], ["행정팀", null]])("통합관리자가 아니면(%s) 계정 서버를 부르지 않는다", async (_label, value) => {
    mocks.values["admins/legacy-admin"] = value;
    mocks.values["retreatAdmins/legacy-admin"] = { semesterRole: "adminTeam", retreatRole: "adminTeam" };
    const response = await POST(request({ email: "team01@woorihigh.com", password: "abcd1234" }));
    expect(response.status).toBe(403);
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });
  it("토큰이 없거나 폐기됐으면 401", async () => {
    expect((await POST(request({}, { Authorization: "" }))).status).toBe(401);
    mocks.verify.mockRejectedValue({ code: "invalid_token" });
    expect((await POST(request({ email: "team01@woorihigh.com", password: "abcd1234" }))).status).toBe(401);
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });
  it("다른 서비스 계정·짧은 비밀번호·다른 사이트 요청은 막고, 비밀번호를 응답에 싣지 않는다", async () => {
    mocks.values["admins/legacy-admin"] = true;
    const outside = await POST(request({ email: "pastor@gmail.com", password: "abcd1234" }));
    expect(outside.status).toBe(400);
    expect((await POST(request({ email: "team01@woorihigh.com", password: "short" }))).status).toBe(400);
    expect((await POST(request({ email: "team01@woorihigh.com", password: "abcd1234" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect(mocks.setPassword).not.toHaveBeenCalled();
    mocks.setPassword.mockRejectedValue({ code: "weak_password" });
    const weak = await POST(request({ email: "team01@woorihigh.com", password: "abcd1234" }));
    expect(weak.status).toBe(400);
    expect(await weak.text()).not.toContain("abcd1234");
  });
  it("계정 서버 장애는 내부 오류를 감추고 503", async () => {
    mocks.values["admins/legacy-admin"] = true;
    mocks.setPassword.mockRejectedValue(new Error("service-role-secret"));
    const response = await POST(request({ email: "team01@woorihigh.com", password: "abcd1234" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("service-role-secret");
  });
});
