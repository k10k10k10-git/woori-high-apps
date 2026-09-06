import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), verify: vi.fn(), ref: vi.fn(), values: {} as Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("./firebaseAdmin", async (importOriginal) => {
  const original = await importOriginal<typeof import("./firebaseAdmin")>();
  return { ...original, getPraiseFirebaseAdmin: mocks.admin };
});
import { authenticatePraiseRequest } from "./httpAuth";
const request = (token: string | null = "Bearer signed-token") => new Request("https://example.test/api/praise", { headers: token ? { authorization: token } : {} });
beforeEach(() => {
  vi.resetAllMocks(); mocks.values = {};
  mocks.verify.mockResolvedValue({ uid: "test-user", name: "테스트", firebase: { sign_in_provider: "google.com" }, roles: { semester: "superAdmin" } });
  mocks.ref.mockImplementation((path: string) => ({ get: async () => ({ val: () => mocks.values[path] ?? null }) }));
  mocks.admin.mockReturnValue({ auth: { verifyIdToken: mocks.verify }, database: { ref: mocks.ref } });
});

describe("찬양팀 요청 인증", () => {
  it.each([null, "Basic abc", "Bearer one two", "Bearer token,Bearer other", "Bearer "])("유효한 단일 Bearer가 없으면 401을 반환한다", async (header) => {
    await expect(authenticatePraiseRequest(request(header))).rejects.toMatchObject({ status: 401 });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("폐기 확인을 요청하고 토큰의 역할 주장을 무시한다", async () => {
    const actor = await authenticatePraiseRequest(request());
    expect(mocks.verify).toHaveBeenCalledWith("signed-token", true);
    expect(actor).toEqual({ uid: "test-user", name: "테스트", roles: { semester: "none", retreat: "none" } });
    expect(mocks.ref).toHaveBeenCalledTimes(4);
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
  it.each(["auth/id-token-revoked", "auth/id-token-expired", "auth/user-disabled"])("폐기·만료·정지된 계정은 원장 조회 전에 거절한다", async (code) => {
    mocks.verify.mockRejectedValue({ code, message: "비공개 내부 오류" });
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 401 });
    expect(mocks.ref).not.toHaveBeenCalled();
  });
  it("익명 Firebase 로그인도 거절한다", async () => {
    mocks.verify.mockResolvedValue({ uid: "test-user", firebase: { sign_in_provider: "anonymous" } });
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 401 });
    expect(mocks.ref).not.toHaveBeenCalled();
  });
  it.each(["bad/path", "bad.uid", "", "a".repeat(129)])("원장 경로로 사용할 수 없는 UID를 거절한다", async (uid) => {
    mocks.verify.mockResolvedValue({ uid });
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 401 });
  });
  it("인증 서비스 장애를 로그인 오류로 숨기지 않는다", async () => {
    mocks.verify.mockRejectedValue({ code: "auth/internal-error", message: "credential details" });
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 503, code: "auth_unavailable" });
  });
  it("역할 조회 실패 시 기본 권한으로 저장을 계속하지 않는다", async () => {
    mocks.ref.mockImplementation(() => ({ get: async () => { throw new Error("network details"); } }));
    await expect(authenticatePraiseRequest(request())).rejects.toMatchObject({ status: 503, code: "roles_unavailable" });
  });
});
