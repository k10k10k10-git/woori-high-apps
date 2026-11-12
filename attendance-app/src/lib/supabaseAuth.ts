import type { Session, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { getCaptchaToken } from "./captcha";
import { isMailboxlessEmail, normalizeEmail } from "./accountEmail";

// Firebase `firebase/auth` 자리(작업 약속 2장). 화면·업무 코드는 `auth.currentUser`,
// `onAuthStateChanged`, `signOut`, `user.getIdToken()`을 Firebase 때와 같은 뜻으로 쓴다.
// 다른 점은 `uid` 다. 규칙과 DB 경로가 쓰는 uid 는 `api.rtdb_whoami()`가 돌려준 값
// (옛 Firebase UID 또는 Supabase id)이고, Supabase 계정 id 는 `supabaseId` 에 따로 둔다.

export type IdTokenClaims = { name?: string; email?: string; sub?: string; [key: string]: unknown };
export interface IdTokenResult {
  token: string;
  claims: IdTokenClaims;
  expirationTime: string;
  issuedAtTime: string;
  signInProvider: string | null;
}
export interface User {
  /** 규칙·DB 경로에서 쓰는 uid (`rtdb_whoami().uid`). */
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;
  /** Supabase `auth.users.id`. 옛 Firebase 계정이면 `uid`와 다르다. */
  readonly supabaseId: string;
  /** Supabase 접근 토큰. 서버 라우트의 `Authorization: Bearer` 에 그대로 쓴다. */
  getIdToken(forceRefresh?: boolean): Promise<string>;
  getIdTokenResult(forceRefresh?: boolean): Promise<IdTokenResult>;
}
export interface Auth { readonly currentUser: User | null }
export type Unsubscribe = () => void;
type Observer = { next?: (user: User | null) => void; error?: (error: Error) => void };
// 관찰자마다 마지막으로 알린 값. undefined 는 "아직 알리지 않음/오류 상태"다.
type Entry = { observer: Observer; last: User | null | undefined };

export class AuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * 로그인은 됐지만 규칙용 uid(whoami)를 확인하지 못했다. `pendingUser`는 화면이
 * "권한 확인 실패 + 다시 시도"를 보여 주기 위한 것이고 토큰을 내주지 않는다.
 */
export class AuthIdentityError extends AuthError {
  constructor(public readonly pendingUser: User) {
    super("auth/identity-unavailable", "로그인 계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    this.name = "AuthIdentityError";
  }
}

type Identity = { uid: string; email: string | null; name: string | null };

const NOT_CONFIGURED = () => new AuthError("auth/not-configured", "로그인 설정이 아직 끝나지 않았습니다. 담당자에게 알려 주세요.");
const UID_FORBIDDEN = /[.#$\[\]/\u0000-\u001f\u007f]/;

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = decodeURIComponent([...atob(base64)].map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Supabase 오류를 화면이 고를 수 있는 Firebase 식 코드로 바꾼다. 원문은 보이지 않는다. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const source = (error ?? {}) as { code?: unknown; status?: unknown; name?: unknown };
  const code = typeof source.code === "string" ? source.code : "";
  const status = typeof source.status === "number" ? source.status : undefined;
  const mapped: Record<string, string> = {
    invalid_credentials: "auth/invalid-credential",
    email_not_confirmed: "auth/email-not-confirmed",
    otp_expired: "auth/invalid-code",
    over_email_send_rate_limit: "auth/too-many-requests",
    over_request_rate_limit: "auth/too-many-requests",
    user_banned: "auth/user-disabled",
    signup_disabled: "auth/signup-disabled",
    email_address_not_authorized: "auth/signup-disabled",
    email_address_invalid: "auth/invalid-email",
    validation_failed: "auth/invalid-email",
    otp_disabled: "auth/operation-not-allowed",
    email_provider_disabled: "auth/operation-not-allowed",
    provider_disabled: "auth/operation-not-allowed",
    captcha_failed: "auth/captcha-failed",
  };
  if (mapped[code]) return new AuthError(mapped[code], "로그인을 완료하지 못했습니다.");
  if (source.name === "AuthRetryableFetchError" || status === 0) return new AuthError("auth/network-request-failed", "네트워크 오류입니다.");
  if (status === 429) return new AuthError("auth/too-many-requests", "요청이 너무 많습니다.");
  return new AuthError("auth/internal-error", "로그인을 완료하지 못했습니다.");
}

class SessionUser implements User {
  readonly supabaseId: string;
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;

  constructor(private readonly client: () => SupabaseClient | null, account: SupabaseUser, private readonly identity: Identity | null) {
    const metadata = (account.user_metadata ?? {}) as Record<string, unknown>;
    this.supabaseId = account.id;
    this.uid = identity?.uid ?? account.id;
    this.email = identity?.email ?? (account.email ? normalizeEmail(account.email) : null);
    this.displayName = identity?.name ?? text(metadata.full_name) ?? text(metadata.name);
  }

  async getIdToken(forceRefresh = false): Promise<string> {
    // 신원 확인 전 대기 사용자는 규칙 uid 가 확정되지 않았으므로 토큰을 내주지 않는다.
    if (!this.identity) throw new AuthError("auth/identity-unavailable", "로그인 계정 정보를 아직 확인하지 못했습니다.");
    const supabase = this.client();
    if (!supabase) throw NOT_CONFIGURED();
    const { data, error } = forceRefresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    const session = data.session;
    if (error || !session?.access_token) throw new AuthError("auth/user-token-expired", "로그인이 만료되었습니다. 다시 로그인해 주세요.");
    if (session.user.id !== this.supabaseId) throw new AuthError("auth/user-mismatch", "로그인 계정이 바뀌었습니다. 새로고침해 주세요.");
    return session.access_token;
  }

  async getIdTokenResult(forceRefresh = false): Promise<IdTokenResult> {
    const token = await this.getIdToken(forceRefresh);
    const payload = decodeJwtPayload(token);
    const claims: IdTokenClaims = { ...payload };
    // 규칙의 auth.token.email/name 과 같은 값(whoami)을 쓴다.
    delete claims.name;
    if (this.identity?.email) claims.email = this.identity.email;
    if (this.identity?.name) claims.name = this.identity.name;
    const seconds = (key: string) => (typeof payload[key] === "number" ? payload[key] as number : 0);
    const appMetadata = payload.app_metadata && typeof payload.app_metadata === "object" ? payload.app_metadata as Record<string, unknown> : {};
    return {
      token,
      claims,
      expirationTime: new Date(seconds("exp") * 1000).toUTCString(),
      issuedAtTime: new Date(seconds("iat") * 1000).toUTCString(),
      signInProvider: text(appMetadata.provider),
    };
  }
}

type Options = {
  client: () => SupabaseClient | null;
  isBrowser?: () => boolean;
  schedule?: (task: () => void, ms: number) => unknown;
  /** whoami 실패 시 다시 묻기 전 기다리는 시간. 다 쓰면 오류 관찰자에게 알린다. */
  retryDelays?: number[];
  /** 로그인 로봇 확인 토큰(운영은 Turnstile). 없으면 토큰 없이 로그인한다. */
  captcha?: () => Promise<string | undefined>;
};

export function createSupabaseAuth({
  client,
  isBrowser = () => typeof window !== "undefined",
  schedule = (task, ms) => setTimeout(task, ms),
  retryDelays = [500, 1500],
  captcha = async () => undefined,
}: Options) {
  const entries = new Set<Entry>();
  let started = false;
  let resolved = false;
  let current: User | null = null;
  let pendingId: string | null = null;
  let lastSession: Session | null = null;
  let identityError: AuthIdentityError | null = null;
  let generation = 0;

  function safeClient(): SupabaseClient | null {
    try { return client(); } catch { return null; }
  }

  function settle(user: User | null) {
    current = user;
    resolved = true;
    pendingId = null;
    identityError = null;
    for (const entry of [...entries]) deliver(entry);
  }

  function deliver(entry: Entry) {
    if (!entries.has(entry) || entry.last === current) return;
    entry.last = current;
    entry.observer.next?.(current);
  }

  function fail(error: AuthIdentityError) {
    resolved = true;
    pendingId = null;
    identityError = error;
    for (const entry of [...entries]) {
      entry.last = undefined;
      entry.observer.error?.(error);
    }
  }

  async function whoami(supabase: SupabaseClient): Promise<Identity> {
    const { data, error } = await supabase.schema("api").rpc("rtdb_whoami");
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { uid?: unknown; email?: unknown; name?: unknown } | null | undefined;
    const uid = text(row?.uid);
    if (!uid || uid.length > 128 || UID_FORBIDDEN.test(uid)) throw new AuthError("auth/identity-invalid", "로그인 계정 정보가 올바르지 않습니다.");
    const email = text(row?.email);
    return { uid, email: email ? normalizeEmail(email) : null, name: text(row?.name) };
  }

  async function resolveIdentity(session: Session, token: number, attempt: number): Promise<void> {
    const supabase = safeClient();
    try {
      if (!supabase) throw NOT_CONFIGURED();
      const identity = await whoami(supabase);
      if (token !== generation) return;
      settle(new SessionUser(safeClient, session.user, identity));
    } catch {
      if (token !== generation) return;
      if (attempt < retryDelays.length) {
        schedule(() => void resolveIdentity(session, token, attempt + 1), retryDelays[attempt]);
        return;
      }
      fail(new AuthIdentityError(new SessionUser(safeClient, session.user, null)));
    }
  }

  function handleSession(session: Session | null) {
    lastSession = session;
    const id = session?.user?.id ?? null;
    if (!session || !id) {
      generation += 1;
      settle(null);
      return;
    }
    // 토큰 갱신·탭 복귀로 같은 계정 이벤트가 다시 와도 사용자 객체(정체성)는 그대로 둔다.
    if (current?.supabaseId === id && !identityError) return;
    if (pendingId === id && !identityError) return;
    generation += 1;
    pendingId = id;
    identityError = null;
    // 다른 계정으로 바뀌는 중에는 이전 계정으로 저장하지 않게 비워 둔다(알림은 확인 뒤).
    current = null;
    void resolveIdentity(session, generation, 0);
  }

  function start() {
    if (started || !isBrowser()) return;
    started = true;
    const supabase = safeClient();
    if (!supabase) {
      settle(null);
      return;
    }
    // Supabase 콜백 안에서 다른 Supabase 호출을 기다리면 교착되므로 다음 작업으로 미룬다.
    supabase.auth.onAuthStateChange((_event, session) => {
      schedule(() => handleSession(session), 0);
    });
  }

  const auth: Auth = {
    get currentUser() {
      start();
      return current;
    },
  };

  function onAuthStateChanged(
    _auth: Auth,
    nextOrObserver: ((user: User | null) => void) | Observer,
    error?: (error: Error) => void,
  ): Unsubscribe {
    start();
    const observer: Observer = typeof nextOrObserver === "function" ? { next: nextOrObserver, error } : nextOrObserver;
    const entry: Entry = { observer, last: undefined };
    entries.add(entry);
    // Firebase 처럼 이미 확정된 상태는 다음 작업에서 한 번 알려 준다. 확인 중이면 확정될 때 알린다.
    queueMicrotask(() => {
      if (!entries.has(entry) || entry.last !== undefined) return;
      if (identityError) observer.error?.(identityError);
      else if (resolved && pendingId === null) deliver(entry);
    });
    return () => { entries.delete(entry); };
  }

  async function signOut(target: Auth = auth): Promise<void> {
    if (target !== auth) throw new AuthError("auth/argument-error", "다른 로그인 상태 객체입니다.");
    start();
    const supabase = safeClient();
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw toAuthError(error);
    }
    generation += 1;
    lastSession = null;
    settle(null);
  }

  /** whoami 실패 뒤 "다시 시도". 다시 물을 세션이 있으면 참. */
  function retryIdentity(): boolean {
    if (!identityError || !lastSession) return false;
    generation += 1;
    pendingId = lastSession.user.id;
    identityError = null;
    void resolveIdentity(lastSession, generation, 0);
    return true;
  }

  function requireClient(): SupabaseClient {
    start();
    const supabase = safeClient();
    if (!supabase) throw NOT_CONFIGURED();
    return supabase;
  }

  function redirectUrl(): string | undefined {
    if (typeof window === "undefined") return undefined;
    const { origin, pathname, search } = window.location;
    return `${origin}${pathname}${search}`;
  }

  async function signInWithEmailPassword(email: string, password: string): Promise<void> {
    const supabase = requireClient();
    const captchaToken = await captcha();
    const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password, options: captchaToken ? { captchaToken } : undefined });
    if (error) throw toAuthError(error);
  }

  async function sendEmailCode(email: string): Promise<void> {
    if (isMailboxlessEmail(email)) throw new AuthError("auth/mailboxless-email", "이 계정은 이메일 코드를 받을 수 없습니다.");
    const supabase = requireClient();
    const captchaToken = await captcha();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: true, emailRedirectTo: redirectUrl(), ...(captchaToken ? { captchaToken } : {}) },
    });
    if (error) throw toAuthError(error);
  }

  async function verifyEmailCode(email: string, code: string): Promise<void> {
    const { error } = await requireClient().auth.verifyOtp({ email: normalizeEmail(email), token: code.trim(), type: "email" });
    if (error) throw toAuthError(error);
  }

  async function signInWithGoogle(): Promise<void> {
    if (!isGoogleLoginEnabled()) throw new AuthError("auth/operation-not-allowed", "Google 로그인이 켜져 있지 않습니다.");
    const { error } = await requireClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrl() } });
    if (error) throw toAuthError(error);
  }

  return { auth, onAuthStateChanged, signOut, retryIdentity, signInWithEmailPassword, sendEmailCode, verifyEmailCode, signInWithGoogle };
}

/** Supabase 에 Google 로그인이 켜졌을 때만 단추를 보인다. */
export function isGoogleLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SUPABASE_GOOGLE === "1";
}

const instance = createSupabaseAuth({ client: () => (isSupabaseConfigured() ? getSupabase() : null), captcha: () => getCaptchaToken() });

export const auth = instance.auth;
export const onAuthStateChanged = instance.onAuthStateChanged;
export const signOut = instance.signOut;
export const retryAuthIdentity = instance.retryIdentity;
export const signInWithEmailPassword = instance.signInWithEmailPassword;
export const sendEmailCode = instance.sendEmailCode;
export const verifyEmailCode = instance.verifyEmailCode;
export const signInWithGoogle = instance.signInWithGoogle;
export function getAuth(): Auth { return auth; }
