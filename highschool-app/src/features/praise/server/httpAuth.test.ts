import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), verify: vi.fn(), get: vi.fn(), values: {} as Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("./supabaseAdmin", async (importOriginal) => {
  const original = await importOriginal<typeof import("./supabaseAdmin")>();
  return { ...original, getPraiseAdmin: mocks.admin };
});
import { authenticatePraiseRequest } from "./httpAuth";
const request = (token: string | null = "Bearer signed-token") => new Request("https://example.test/api/praise", { headers: token ? { authorization: token } : {} });
beforeEach(() => {
  vi.resetAllMocks(); mocks.values = {};
  mocks.verify.mockResolvedValue({ uid: "test-user", name: "테스트", email: "t@example.test", supabaseId: "sb-1", anonymous: false, disabled: false, roles: { semester: "superAdmin" } });
  mocks.get.mockImplementation(async (path: string) => mocks.values[path] ?? null);
  mocks.admin.mockReturnValue({ auth: { verifyAccessToken: mocks.verify }, database: { get: mocks.get } });
});

describe("찬양팀 요청 인증", () => {
  it.each([null, "Basic abc", "Bearer one two", "Bearer token,Bearer other", "Bearer "])("유효한 단일 Bearer가 없으면 401을 반환한다", async (header) => {
    await expect(authenticatePraiseRequest(request(header))).rejects.toMatchObject({ status: 401 });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("인증 서버 확인을 요청하고 토큰의 역할 주장을 무시한다", async () => {
    const actor = await authenticatePraiseRequest(request());
    expect(mocks.verify).toHaveBeenCalledWith("signed-token");
    expect(actor).toEqual({ uid: "test-user", name: "테스트", roles: { semester: "none", retreat: "none" }, teamMemberships: {} });
    expect(mocks.get).toHaveBeenCalledTimes(4);
  });
  it("현재 admins의 true만 통합관리자로 인정한다", async () => {
    mocks.values["admins/test-user"] = true;
    expect((await authenticatePraiseRequest(request())).roles).toEqual({ semester: "superAdmin", retreat: "superAdmin" });
    mocks.values["admins/test-user"] = "true";
    expect((await authenticatePraiseRequest(request())).roles).toEqual({ semester: "none", retreat: "none" });
  });
  it("역할 회수는 다음 요청부터 반영하고 캐시하지 않는다", async () => {
    mocks.values["iguardMembers/test-user"] = { semesterRole: "staff", retreatRole: "fieldStaff" };
    mocks.values["iguardRoles/test-user"] = "staff";
    expect((await authenticatePraiseRequest(request())).roles).toEqual({ semester: "staff", retreat: "fieldStaff" });
    mocks.values = {};
    expect((await authenticatePraiseRequest(request())).roles).toEqual({ semester: "none", retreat: "none" });
  });
  it("기존 인증 컨텍스트와 같은 레코드 우선순위 및 두 축 역할을 사용한다", async () => {
    mocks.values["retreatAdmins/test-user"] = { role: "pastor", semesterRole: "staff", retreatRole: "leader" };
    mocks.values["iguardMembers/test-user"] = { semesterRole: "adminTeam" };
    expect((await authenticatePraiseRequest(request())).roles).toEqual({ semester: "staff", retreat: "leader" });
  });
  it("두 권한 원장에 나뉜 담당 팀을 합쳐 서버 권한에 전달한다", async () => {
    mocks.values["retreatAdmins/test-user"] = { teamMemberships: { media: { role: "viewer", active: true } } };
    mocks.values["iguardMembers/test-user"] = { teamMemberships: { praise: { role: "staff", active: true } } };
    expect((await authenticatePraiseRequest(request())).teamMemberships).toEqual({
      media: { role: "viewer", active: true },
      praise: { role: "staff", active: true },
    });
  });
  it("폐기·만료·삭제된 토큰은 원장 조회 전에 거절한다", async () => {
    mocks.verify.mockRejectedValue({ code: "invalid_token", message: "비공개 내부 오류" });
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 401 });
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each([["익명", { anonymous: true }], ["정지", { disabled: true }]])("%s 계정도 원장 조회 전에 거절한다", async (_label, flags) => {
    mocks.verify.mockResolvedValue({ uid: "test-user", name: null, email: null, supabaseId: "sb-1", anonymous: false, disabled: false, ...flags });
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 401 });
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(["bad/path", "bad.uid", "", "a".repeat(129)])("원장 경로로 사용할 수 없는 UID를 거절한다", async (uid) => {
    mocks.verify.mockResolvedValue({ uid, anonymous: false, disabled: false });
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 401 });
  });
  it("인증 서비스 장애를 로그인 오류로 숨기지 않는다", async () => {
    mocks.verify.mockRejectedValue({ code: "auth_unavailable", message: "credential details" });
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 503, code: "auth_unavailable" });
  });
  it("역할 조회 실패 시 기본 권한으로 저장을 계속하지 않는다", async () => {
    mocks.get.mockRejectedValue(new Error("network details"));
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 503, code: "roles_unavailable" });
  });
});
