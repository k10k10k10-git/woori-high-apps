import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), rpc: vi.fn(), userRpc: vi.fn(), getUser: vi.fn(),
  listUsers: vi.fn(), getUserById: vi.fn(), updateUserById: vi.fn(), createUser: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { firebaseValue, getPraiseAdmin, storageValue } from "./supabaseAdmin";

const REF = "abcdefghijklmnopqrst";
const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const SERVICE = jwt({ role: "service_role", ref: REF });
function configured() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${REF}.supabase.co`);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt({ role: "anon", ref: REF }));
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE);
}
let counter = 0;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  mocks.createClient.mockImplementation((_url: string, key: string) => key === SERVICE
    ? { schema: () => ({ rpc: mocks.rpc }), auth: { getUser: mocks.getUser, admin: { listUsers: mocks.listUsers, getUserById: mocks.getUserById, updateUserById: mocks.updateUserById, createUser: mocks.createUser } } }
    : { schema: () => ({ rpc: mocks.userRpc }) });
});
afterEach(() => vi.unstubAllEnvs());

/** 설정마다 새 서버 연결을 쓰도록 키에 일련번호를 붙인다(모듈 캐시와 시험 격리). */
function admin() {
  configured();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt({ role: "anon", ref: REF, n: (counter += 1) }));
  return getPraiseAdmin();
}

describe("찬양팀 서버 자격 경계", () => {
  it("미설정 상태에서 다른 연결을 찾지 않고 503으로 중단한다", () => {
    expect(() => getPraiseAdmin()).toThrow(expect.objectContaining({ status: 503, code: "server_not_configured" }));
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("지정 프로젝트 서버 연결을 만들고 같은 설정이면 재사용한다", () => {
    configured(); const first = getPraiseAdmin(); const second = getPraiseAdmin();
    expect(first).toBe(second); expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(`https://${REF}.supabase.co`, SERVICE, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  });
  it.each([
    "https://example.com", `https://${REF}.supabase.co.evil.example`, `http://${REF}.supabase.co`, `https://${REF}.supabase.co/rest`,
    `https://${REF}.supabase.co?key=test`, `https://${REF}.supabase.co:8443`, "http://127.0.0.1:54321",
  ])("허용하지 않은 서버 주소를 거절한다: %s", (url) => {
    configured(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    expect(() => getPraiseAdmin()).toThrow(expect.objectContaining({ status: 503 }));
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each(["malformed", jwt({ role: "anon", ref: REF }), jwt({ role: "service_role", ref: "zzzzzzzzzzzzzzzzzzzz" }), "eyJ.e30"])("서버 키가 잘못되어도 원문을 노출하지 않는다", (key) => {
    configured(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);
    expect(() => getPraiseAdmin()).toThrow("찬양팀 서버 연결을 확인하고 다시 시도해 주세요.");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("공개 키를 서버 키 자리에 넣은 설정을 거절한다", () => {
    configured(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", jwt({ role: "anon", ref: REF }));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt({ role: "anon", ref: REF }));
    expect(() => getPraiseAdmin()).toThrow(expect.objectContaining({ status: 503 }));
  });
  it("새 비밀 키(sb_secret_) 형식도 받는다", () => {
    configured(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
    expect(() => getPraiseAdmin()).not.toThrow();
  });
});

describe("Firebase Admin 과 같은 값 모양", () => {
  it("숫자 키 객체는 Firebase 처럼 배열로, 빈 노드는 null 로, 키는 Firebase 순서로 읽는다", () => {
    expect(firebaseValue({ "0": "a", "1": "b", "3": "d" })).toEqual(["a", "b", undefined, "d"]);
    expect(firebaseValue({ "0": "a", "5": "f" })).toEqual({ "0": "a", "5": "f" });
    expect(firebaseValue({ a: { b: null }, c: 1 })).toEqual({ c: 1 });
    expect(firebaseValue({})).toBeNull();
    expect(Object.keys(firebaseValue({ b: 1, "10": 1, a: 1, "2": 1, "007": 1 }) as object)).toEqual(["2", "10", "007", "a", "b"]);
  });
  it("쓰기 값은 Firebase 검사와 같게 정리하고 거절한다", () => {
    expect(storageValue({ list: ["a", null, "c"], gone: null, empty: {} })).toEqual({ list: { "0": "a", "2": "c" } });
    expect(() => storageValue({ a: undefined })).toThrow();
    expect(() => storageValue({ a: Number.NaN })).toThrow();
    expect(() => storageValue({ "a.b": 1 })).toThrow();
  });
});

describe("규칙 없는 서버 DB", () => {
  it("읽기는 rtdb_admin_get, 얕은 목록은 키만 돌려준다", async () => {
    const { database } = admin();
    mocks.rpc.mockResolvedValue({ data: { b: { deep: 1 }, a: true }, error: null });
    expect(await database.get("/semesters/")).toEqual({ a: true, b: { deep: 1 } });
    expect(mocks.rpc).toHaveBeenCalledWith("rtdb_admin_get", { p_path: "semesters" });
    expect(await database.shallow("semesters")).toEqual({ a: true, b: true });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await database.shallow("semesters")).toBeNull();
  });
  it("경로에 쓸 수 없는 글자는 서버에 묻기 전에 거절한다", async () => {
    const { database } = admin();
    await expect(database.get("admins/a.b")).rejects.toMatchObject({ code: "invalid_path" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("transaction 은 지금 값·hash 를 읽고 cas 로 쓰며, 충돌하면 최신 값으로 다시 계산한다", async () => {
    const { database } = admin();
    mocks.rpc
      .mockResolvedValueOnce({ data: { committed: false, value: { n: 1 }, hash: "h1" }, error: null })
      .mockResolvedValueOnce({ data: { committed: false, value: { n: 5 }, hash: "h2" }, error: null })
      .mockResolvedValueOnce({ data: { committed: true, value: { n: 6 }, hash: "h3" }, error: null });
    const seen: unknown[] = [];
    const result = await database.transaction("finance/x", (current) => { seen.push(current); return { n: (current as { n: number }).n + 1 }; });
    expect(seen).toEqual([{ n: 1 }, { n: 5 }]);
    expect(result).toEqual({ committed: true, value: { n: 6 } });
    expect(mocks.rpc.mock.calls[0]).toEqual(["rtdb_admin_cas", { p_path: "finance/x", p_expected: "probe:never-a-hash", p_value: null }]);
    expect(mocks.rpc.mock.calls[1]).toEqual(["rtdb_admin_cas", { p_path: "finance/x", p_expected: "h1", p_value: { n: 2 } }]);
    expect(mocks.rpc.mock.calls[2]).toEqual(["rtdb_admin_cas", { p_path: "finance/x", p_expected: "h2", p_value: { n: 6 } }]);
  });
  it("updater 가 undefined 를 돌려주면 쓰지 않고, 확인용 읽기가 써져 버리면 오류로 멈춘다", async () => {
    const { database } = admin();
    mocks.rpc.mockResolvedValueOnce({ data: { committed: false, value: null, hash: "h0" }, error: null });
    expect(await database.transaction("a", () => undefined)).toEqual({ committed: false, value: null });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    mocks.rpc.mockResolvedValueOnce({ data: { committed: true, value: null, hash: "h0" }, error: null });
    await expect(database.readHashed("a")).rejects.toMatchObject({ code: "unexpected_probe_commit" });
  });
  it("서버 함수 거절은 code 만 남기고 원문을 버린다", async () => {
    const { database } = admin();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission_denied:secret/path" } });
    await expect(database.get("a")).rejects.toMatchObject({ code: "permission_denied", message: "permission_denied" });
  });
});

describe("요청자 토큰 확인", () => {
  it("Supabase 인증으로 토큰을 확인하고 그 사용자 토큰으로 whoami 를 불러 규칙 uid 를 얻는다", async () => {
    const { auth } = admin();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "sb-1", is_anonymous: false } }, error: null });
    mocks.userRpc.mockResolvedValue({ data: [{ uid: "legacy-uid", email: "A@Example.test", name: "홍길동" }], error: null });
    expect(await auth.verifyAccessToken("user-token")).toEqual({ uid: "legacy-uid", email: "a@example.test", name: "홍길동", supabaseId: "sb-1", anonymous: false, disabled: false });
    expect(mocks.getUser).toHaveBeenCalledWith("user-token");
    expect(mocks.createClient).toHaveBeenLastCalledWith(`https://${REF}.supabase.co`, expect.any(String), expect.objectContaining({ global: { headers: { Authorization: "Bearer user-token" } } }));
    expect(mocks.userRpc).toHaveBeenCalledWith("rtdb_whoami");
  });
  it.each([
    [{ code: "bad_jwt", status: 403 }, "invalid_token"],
    [{ code: "session_not_found", status: 403 }, "invalid_token"],
    [{ code: "user_not_found", status: 404 }, "invalid_token"],
    [{ name: "AuthRetryableFetchError", status: 0 }, "auth_unavailable"],
    [{ status: 500 }, "auth_unavailable"],
  ])("폐기·만료 토큰과 인증 서버 장애를 구분한다 (%o)", async (error, code) => {
    const { auth } = admin();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    await expect(auth.verifyAccessToken("t")).rejects.toMatchObject({ code });
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });
  it("정지된 계정과 익명 계정을 표시한다", async () => {
    const { auth } = admin();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "sb-1", is_anonymous: true, banned_until: "2999-01-01T00:00:00Z" } }, error: null });
    mocks.userRpc.mockResolvedValue({ data: [{ uid: "sb-1", email: null, name: null }], error: null });
    expect(await auth.verifyAccessToken("t")).toMatchObject({ anonymous: true, disabled: true });
  });
});

describe("계정 관리", () => {
  it("옛 Firebase UID 는 첫 로그인 전이라 확인할 수 없고, Supabase 계정은 정지·없음을 구분한다", async () => {
    const { auth } = admin();
    expect(await auth.accountStatus("LegacyFirebaseUid0123456789")).toBe("unverifiable");
    const id = "11111111-2222-4333-8444-555555555555";
    mocks.getUserById.mockResolvedValueOnce({ data: { user: { id, banned_until: "2999-01-01T00:00:00Z" } }, error: null });
    expect(await auth.accountStatus(id)).toBe("disabled");
    mocks.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, code: "user_not_found" } });
    expect(await auth.accountStatus(id)).toBe("missing");
  });
  it("비밀번호는 있는 계정이면 바꾸고 이메일 확인 처리를 한다", async () => {
    const { auth } = admin();
    mocks.listUsers.mockResolvedValue({ data: { users: [{ id: "sb-1", email: "Team01@WooriHigh.com" }] }, error: null });
    mocks.updateUserById.mockResolvedValue({ data: {}, error: null });
    expect(await auth.setPassword("team01@woorihigh.com", "new-password")).toEqual({ created: false });
    expect(mocks.updateUserById).toHaveBeenCalledWith("sb-1", { password: "new-password", email_confirm: true });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("계정이 없으면 이메일 확인된 계정으로 만들고, 동시에 생겼으면 그 계정의 비밀번호를 정한다", async () => {
    const { auth } = admin();
    mocks.listUsers.mockResolvedValueOnce({ data: { users: [] }, error: null });
    mocks.createUser.mockResolvedValueOnce({ data: {}, error: null });
    expect(await auth.setPassword("team02@woorihigh.com", "new-password")).toEqual({ created: true });
    expect(mocks.createUser).toHaveBeenCalledWith({ email: "team02@woorihigh.com", password: "new-password", email_confirm: true });
    mocks.listUsers.mockResolvedValueOnce({ data: { users: [] }, error: null }).mockResolvedValueOnce({ data: { users: [{ id: "sb-9", email: "team03@woorihigh.com" }] }, error: null });
    mocks.createUser.mockResolvedValueOnce({ data: {}, error: { code: "email_exists", status: 422 } });
    mocks.updateUserById.mockResolvedValue({ data: {}, error: null });
    expect(await auth.setPassword("team03@woorihigh.com", "new-password")).toEqual({ created: false });
    expect(mocks.updateUserById).toHaveBeenCalledWith("sb-9", { password: "new-password", email_confirm: true });
  });
  it("약한 비밀번호 거절은 따로 알린다", async () => {
    const { auth } = admin();
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    mocks.createUser.mockResolvedValue({ data: {}, error: { code: "weak_password", status: 422 } });
    await expect(auth.setPassword("team04@woorihigh.com", "123")).rejects.toMatchObject({ code: "weak_password" });
  });
});
