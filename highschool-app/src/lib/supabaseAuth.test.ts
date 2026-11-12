import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthIdentityError, createSupabaseAuth, toAuthError, type User } from "./supabaseAuth";

type Session = { access_token: string; user: { id: string; email?: string; user_metadata?: Record<string, unknown> } };
const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (payload: Record<string, unknown>) => `h.${base64url(payload)}.s`;
const session = (id: string, extra: Record<string, unknown> = {}): Session => ({
  access_token: jwt({ sub: id, exp: 2_000_000_000, iat: 1_900_000_000, email: `${id}@example.test`, app_metadata: { provider: "email" }, ...extra }),
  user: { id, email: `${id.toUpperCase()}@Example.test`, user_metadata: { full_name: "메타 이름" } },
});

function setup(options: { configured?: boolean } = {}) {
  let listener: ((event: string, value: Session | null) => void) | undefined;
  const state = { session: null as Session | null };
  const rpc = vi.fn<(name: string) => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: [{ uid: "legacy-uid", email: "a@example.test", name: "홍길동" }], error: null }));
  const client = {
    auth: {
      onAuthStateChange: vi.fn((callback: typeof listener) => { listener = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
      getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
      signOut: vi.fn<(input?: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
      signInWithPassword: vi.fn<(input?: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
      signInWithOtp: vi.fn<(input?: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
      verifyOtp: vi.fn<(input?: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
    },
    schema: vi.fn(() => ({ rpc })),
  };
  const instance = createSupabaseAuth({
    client: () => (options.configured === false ? null : client as unknown as SupabaseClient),
    isBrowser: () => true,
    retryDelays: [100, 200],
  });
  const next = vi.fn<(user: User | null) => void>();
  const error = vi.fn<(error: Error) => void>();
  const emit = async (value: Session | null) => {
    state.session = value;
    listener?.("SIGNED_IN", value);
    await vi.runAllTimersAsync();
  };
  return { instance, client, rpc, next, error, emit, state };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("Supabase 로그인 상태 — Firebase onAuthStateChanged 와 같은 뜻", () => {
  it("세션 복원과 whoami 가 끝나기 전에는 아무것도 알리지 않고, 끝나면 규칙용 uid 로 한 번 알린다", async () => {
    const { instance, rpc, next, error, emit } = setup();
    instance.onAuthStateChanged(instance.auth, next, error);
    await vi.runAllTimersAsync();
    expect(next).not.toHaveBeenCalled();
    await emit(session("sb-a"));
    expect(rpc).toHaveBeenCalledWith("rtdb_whoami");
    expect(next).toHaveBeenCalledOnce();
    const user = next.mock.calls[0][0]!;
    expect(user).toMatchObject({ uid: "legacy-uid", supabaseId: "sb-a", email: "a@example.test", displayName: "홍길동" });
    expect(instance.auth.currentUser).toBe(user);
    expect(error).not.toHaveBeenCalled();
  });

  it("토큰 갱신·탭 복귀로 같은 계정 이벤트가 다시 와도 사용자 객체를 바꾸지 않는다", async () => {
    const { instance, rpc, next, emit } = setup();
    instance.onAuthStateChanged(instance.auth, next);
    await emit(session("sb-a"));
    const user = instance.auth.currentUser;
    await emit(session("sb-a", { iat: 1_900_000_100 }));
    expect(instance.auth.currentUser).toBe(user);
    expect(next).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("세션이 없으면 로그인 없음(null)으로 확정하고, 늦게 붙은 관찰자도 같은 값을 받는다", async () => {
    const { instance, next, emit } = setup();
    instance.onAuthStateChanged(instance.auth, next);
    await emit(null);
    expect(next).toHaveBeenCalledWith(null);
    const late = vi.fn();
    instance.onAuthStateChanged(instance.auth, late);
    await vi.runAllTimersAsync();
    expect(late).toHaveBeenCalledWith(null);
  });

  it("다른 계정으로 바뀌면 즉시 currentUser 를 비워 이전 계정 저장을 막고, 새 계정 확인 뒤 알린다", async () => {
    const { instance, rpc, next, emit } = setup();
    instance.onAuthStateChanged(instance.auth, next);
    await emit(session("sb-a"));
    let resolveWhoami!: (value: unknown) => void;
    // Supabase 이벤트만 흘려보내고 whoami 응답은 붙잡아 둔다.
    rpc.mockImplementationOnce(() => new Promise((resolve) => { resolveWhoami = resolve; }) as never);
    const previous = instance.auth.currentUser!;
    await emit(session("sb-b"));
    await expect(previous.getIdToken()).rejects.toMatchObject({ code: "auth/user-mismatch" });
    expect(instance.auth.currentUser).toBeNull();
    expect(next).toHaveBeenCalledOnce();
    resolveWhoami({ data: [{ uid: "sb-b", email: "b@example.test", name: null }], error: null });
    await vi.runAllTimersAsync();
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[1][0]).toMatchObject({ uid: "sb-b", supabaseId: "sb-b", displayName: "메타 이름" });
  });

  it("whoami 가 계속 실패하면 정해진 횟수만 다시 묻고 오류 관찰자에 확인 대기 계정을 넘긴다", async () => {
    const { instance, rpc, next, error, emit } = setup();
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST301" } });
    instance.onAuthStateChanged(instance.auth, next, error);
    await emit(session("sb-a"));
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    const failure = error.mock.calls[0][0] as AuthIdentityError;
    expect(failure).toBeInstanceOf(AuthIdentityError);
    expect(failure.pendingUser).toMatchObject({ uid: "sb-a", supabaseId: "sb-a" });
    await expect(failure.pendingUser.getIdToken()).rejects.toMatchObject({ code: "auth/identity-unavailable" });
    expect(instance.auth.currentUser).toBeNull();

    rpc.mockResolvedValue({ data: [{ uid: "legacy-uid", email: "a@example.test", name: null }], error: null });
    expect(instance.retryIdentity()).toBe(true);
    await vi.runAllTimersAsync();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ uid: "legacy-uid" });
  });

  it.each([["", "빈 값"], ["a/b", "경로 문자"], ["a.b", "점"]])("규칙 경로로 쓸 수 없는 whoami uid(%s)는 받아들이지 않는다", async (uid) => {
    const { instance, rpc, next, error, emit } = setup();
    rpc.mockResolvedValue({ data: [{ uid, email: null, name: null }], error: null });
    instance.onAuthStateChanged(instance.auth, next, error);
    await emit(session("sb-a"));
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it("접근 토큰은 지금 세션의 것을 주고, 세션 계정이 바뀌었으면 거절한다", async () => {
    const { instance, next, emit, state } = setup();
    instance.onAuthStateChanged(instance.auth, next);
    await emit(session("sb-a"));
    const user = instance.auth.currentUser!;
    expect(await user.getIdToken()).toBe(state.session!.access_token);
    const result = await user.getIdTokenResult();
    expect(result.claims).toMatchObject({ sub: "sb-a", email: "a@example.test", name: "홍길동" });
    expect(result.signInProvider).toBe("email");
    state.session = session("sb-b");
    await expect(user.getIdToken()).rejects.toMatchObject({ code: "auth/user-mismatch" });
    state.session = null;
    await expect(user.getIdToken()).rejects.toMatchObject({ code: "auth/user-token-expired" });
  });

  it("로그아웃은 이 기기 세션만 끝내고 null 을 알린다. 실패하면 로그인 상태를 유지한다", async () => {
    const { instance, client, next, emit } = setup();
    instance.onAuthStateChanged(instance.auth, next);
    await emit(session("sb-a"));
    client.auth.signOut.mockResolvedValueOnce({ error: { name: "AuthRetryableFetchError", status: 0 } });
    await expect(instance.signOut(instance.auth)).rejects.toMatchObject({ code: "auth/network-request-failed" });
    expect(instance.auth.currentUser).not.toBeNull();
    await instance.signOut(instance.auth);
    expect(client.auth.signOut).toHaveBeenLastCalledWith({ scope: "local" });
    expect(instance.auth.currentUser).toBeNull();
    expect(next).toHaveBeenLastCalledWith(null);
  });

  it("공개 설정이 없으면 앱은 로그인 없음으로 뜨고 로그인 함수는 설정 오류를 준다", async () => {
    const { instance, next } = setup({ configured: false });
    instance.onAuthStateChanged(instance.auth, next);
    await vi.runAllTimersAsync();
    expect(next).toHaveBeenCalledWith(null);
    await expect(instance.signInWithEmailPassword("a@example.test", "pw")).rejects.toMatchObject({ code: "auth/not-configured" });
  });
});

describe("이메일 로그인", () => {
  it("코드 로그인은 새 계정도 만들 수 있게 요청하고, 입력한 이메일을 소문자로 맞춘다", async () => {
    const { instance, client } = setup();
    await instance.sendEmailCode(" Staff@Example.test ");
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "staff@example.test",
      options: expect.objectContaining({ shouldCreateUser: true }),
    });
    await instance.verifyEmailCode("Staff@Example.test", " 123456 ");
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ email: "staff@example.test", token: "123456", type: "email" });
  });

  it("메일함이 없는 @woorihigh.com 계정에는 코드를 보내지 않는다", async () => {
    const { instance, client } = setup();
    await expect(instance.sendEmailCode("team01@WooriHigh.com")).rejects.toMatchObject({ code: "auth/mailboxless-email" });
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("Google 로그인은 주소를 받아 직접 연다: 데스크톱 틀 안이면 바깥 창을 보낸다(2026-11-12 403 회귀)", async () => {
    const { instance, client } = setup();
    const signInWithOAuth = vi.fn(async (_input: unknown) => ({ data: { provider: "google", url: "https://example.supabase.co/auth/v1/authorize?provider=google" }, error: null }));
    (client.auth as Record<string, unknown>).signInWithOAuth = signInWithOAuth;
    const top = { location: { origin: "https://woorihigh-app.vercel.app", pathname: "/teams", search: "?tab=a", assign: vi.fn() } } as Record<string, unknown>;
    top.top = top;
    const frame = { location: { origin: "https://woorihigh-app.vercel.app", pathname: "/teams", search: "?tab=a&__portalFrame=desktop", assign: vi.fn() }, top };
    vi.stubGlobal("window", frame);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_GOOGLE", "1");
    try {
      await instance.signInWithGoogle();
      expect(signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "https://woorihigh-app.vercel.app/teams?tab=a", skipBrowserRedirect: true } });
      expect((top.location as { assign: ReturnType<typeof vi.fn> }).assign).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/authorize?provider=google");
      expect(frame.location.assign).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("Google 로그인은 환경 변수로 켰을 때만 시작한다", async () => {
    const { instance } = setup();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_GOOGLE", "");
    await expect(instance.signInWithGoogle()).rejects.toMatchObject({ code: "auth/operation-not-allowed" });
    vi.unstubAllEnvs();
  });

  it.each([
    [{ code: "invalid_credentials", status: 400 }, "auth/invalid-credential"],
    [{ code: "otp_expired", status: 403 }, "auth/invalid-code"],
    [{ code: "over_email_send_rate_limit", status: 429 }, "auth/too-many-requests"],
    [{ code: "user_banned", status: 403 }, "auth/user-disabled"],
    [{ name: "AuthRetryableFetchError", status: 0 }, "auth/network-request-failed"],
    [{ message: "internal stack" }, "auth/internal-error"],
  ])("Supabase 오류를 화면용 코드로 바꾸고 원문을 감춘다 (%o)", (source, code) => {
    const mapped = toAuthError(source);
    expect(mapped.code).toBe(code);
    expect(mapped.message).not.toContain("internal stack");
  });
});
