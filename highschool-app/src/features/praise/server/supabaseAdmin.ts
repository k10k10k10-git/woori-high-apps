import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Firebase Admin SDK 자리(작업 약속 1·2장). 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`로
// `api.rtdb_admin_*`(규칙 없이 읽고 쓰기)를 부르고, 요청자의 접근 토큰은 Supabase 인증으로 확인한다.
// 값 모양은 Firebase Admin `ref(path).get().val()`·`transaction()`과 같다.

/** 토큰·키·SDK 내부 오류를 응답에 노출하지 않는 서버 경계 오류. */
export class PraiseRequestError extends Error {
  constructor(public status: 401 | 503, message: string, public code: string) {
    super(message);
    this.name = "PraiseRequestError";
  }
}

export function praiseUnavailable(code = "praise_unavailable"): PraiseRequestError {
  return new PraiseRequestError(503, "찬양팀 서버 연결을 확인하고 다시 시도해 주세요.", code);
}

/** DB·인증 어댑터 내부 오류. 호출자가 code 로 분류하고 원문은 응답에 싣지 않는다. */
export class AdminError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AdminError";
  }
}

export type AdminTransactionResult = { committed: boolean; value: unknown };
export type HashedValue = { value: unknown; hash: string };

export interface PraiseAdminDatabase {
  /** Firebase Admin `ref(path).get().val()` 과 같다(숫자 키 배열 변환·빈 노드 null 포함). */
  get(path: string): Promise<unknown>;
  /** Firebase REST `?shallow=true` 와 같다: 객체면 `{ 키: true }`, 아니면 그 값. */
  shallow(path: string): Promise<unknown>;
  /** Firebase Admin `ref(path).transaction(update)` — undefined 를 돌려주면 쓰지 않는다. */
  transaction(path: string, update: (current: unknown) => unknown): Promise<AdminTransactionResult>;
  /** 비동기 검증을 끼우는 저장(옛 ETag 조건부 PUT 자리)용: 지금 값과 hash. */
  readHashed(path: string): Promise<HashedValue>;
  /** hash 가 그대로면 쓰고, 아니면 지금 값을 돌려준다. */
  compareAndSet(path: string, expectedHash: string, value: unknown): Promise<HashedValue & { committed: boolean }>;
}

export type VerifiedAccount = {
  /** 규칙·DB 경로의 uid (`rtdb_whoami`). */
  uid: string;
  email: string | null;
  name: string | null;
  supabaseId: string;
  anonymous: boolean;
  disabled: boolean;
};
export type AccountStatus = "active" | "disabled" | "missing" | "unverifiable";

export interface PraiseAdminAuth {
  /** 접근 토큰을 Supabase 인증 서버에 확인하고(만료·폐기·삭제 계정 거절), 그 토큰으로 whoami 를 부른다. */
  verifyAccessToken(token: string): Promise<VerifiedAccount>;
  /** 규칙 uid 의 로그인 계정 상태. 옛 Firebase UID 는 첫 로그인 전이라 확인할 수 없다. */
  accountStatus(uid: string): Promise<AccountStatus>;
  /** 이메일 계정의 비밀번호를 정한다. 없으면 이메일 확인된 계정으로 만든다. */
  setPassword(email: string, password: string): Promise<{ created: boolean }>;
}

export type PraiseAdmin = { database: PraiseAdminDatabase; auth: PraiseAdminAuth };

type Config = { url: string; anonKey: string; serviceKey: string };

function jwtClaims(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error();
  const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}

function configuration(): Config {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anonKey || !serviceKey || serviceKey === anonKey) throw praiseUnavailable("server_not_configured");
  try {
    const parsed = new URL(url);
    const host = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
    // 검증하지 않은 로컬·사설 주소로 운영 요청이 흘러가지 않게 Supabase 프로젝트 주소만 받는다.
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || !["", "/"].includes(parsed.pathname) || !host) throw new Error();
    // 새 비밀 키(sb_secret_)가 아니면 service_role 이고 같은 프로젝트의 키여야 한다(공개 키 오설정 차단).
    if (!serviceKey.startsWith("sb_secret_")) {
      const claims = jwtClaims(serviceKey);
      if (claims.role !== "service_role" || (claims.ref !== undefined && claims.ref !== host[1])) throw new Error();
    }
    return { url: parsed.origin, anonKey, serviceKey };
  } catch {
    throw praiseUnavailable("server_not_configured");
  }
}

const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;
const FORBIDDEN_KEY = /[.#$\[\]/\u0000-\u001f\u007f]/;
const ARRAY_KEY = /^(0|[1-9]\d*)$/;
const INT_KEY = /^-?(0*)\d{1,10}$/;
/** cas 로 지금 값·hash 만 읽을 때 쓰는 값. md5 16진수와 절대 같지 않다. */
const PROBE_HASH = "probe:never-a-hash";

function adminPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.some((part) => FORBIDDEN_KEY.test(part))) throw new AdminError("invalid_path");
  return parts.join("/");
}

function intKey(key: string): number | null {
  if (!INT_KEY.test(key)) return null;
  const value = Number(key);
  return value >= -2147483648 && value <= 2147483647 ? value : null;
}

/** Firebase 키 순서: 32비트 정수 키 오름차순 → 나머지 문자열 사전순. */
function compareKeys(a: string, b: string): number {
  if (a === b) return 0;
  const left = intKey(a);
  const right = intKey(b);
  if (left !== null && right !== null) return left - right === 0 ? a.length - b.length : left - right;
  if (left !== null) return -1;
  if (right !== null) return 1;
  return a < b ? -1 : 1;
}

/** 저장소 모양(키→값) → Firebase `val()` 모양. */
export function firebaseValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;
  const source = Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : value as Record<string, unknown>;
  const entries = Object.entries(source)
    .map(([key, child]) => [key, firebaseValue(child)] as const)
    .filter(([, child]) => child !== null)
    .sort(([a], [b]) => compareKeys(a, b));
  if (entries.length === 0) return null;
  const arrayLike = entries.every(([key]) => ARRAY_KEY.test(key));
  const maxKey = arrayLike ? Math.max(...entries.map(([key]) => Number(key))) : 0;
  if (arrayLike && maxKey < 2 * entries.length) {
    const array: unknown[] = [];
    for (const [key, child] of entries) array[Number(key)] = child;
    return array;
  }
  return Object.fromEntries(entries);
}

/** Firebase 쓰기 검사와 같게: undefined·무한수·금지 키는 거절, null 자식·빈 객체는 없음으로, 배열은 인덱스 키로. */
export function storageValue(value: unknown, path = ""): unknown {
  if (value === undefined) throw new AdminError(`undefined_value:${path}`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AdminError(`invalid_number:${path}`);
    return value;
  }
  if (typeof value !== "object") throw new AdminError(`invalid_value:${path}`);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!key || FORBIDDEN_KEY.test(key)) throw new AdminError(`invalid_key:${path}`);
    const child = storageValue((value as Record<string, unknown>)[key], `${path}/${key}`);
    if (child !== null) result[key] = child;
  }
  return Object.keys(result).length ? result : null;
}

function rpcFailure(error: { code?: unknown }): AdminError {
  const code = typeof error.code === "string" ? error.code : "";
  return new AdminError(code === "42501" ? "permission_denied" : code === "23514" ? "validation_failed" : "rpc_failed");
}

function hashed(data: unknown): HashedValue & { committed: boolean } {
  const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  if (!record || typeof record.committed !== "boolean" || typeof record.hash !== "string") throw new AdminError("invalid_cas_result");
  return { committed: record.committed, value: record.value ?? null, hash: record.hash };
}

function createDatabase(service: SupabaseClient): PraiseAdminDatabase {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await service.schema("api").rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }
  async function rawCas(path: string, expected: string, value: unknown) {
    return hashed(await rpc("rtdb_admin_cas", { p_path: adminPath(path), p_expected: expected, p_value: storageValue(value) }));
  }
  async function readRaw(path: string) {
    const result = await rawCas(path, PROBE_HASH, null);
    if (result.committed) throw new AdminError("unexpected_probe_commit");
    return result;
  }
  return {
    async get(path) {
      return firebaseValue(await rpc("rtdb_admin_get", { p_path: adminPath(path) }));
    },
    async shallow(path) {
      // 지금은 rtdb_admin_get 결과에서 키만 남긴다(응답에는 키만 싣지만 DB 에서 읽는 양은 전체다).
      // DB 에 얕은 조회 함수가 생기면 이 함수만 바꾼다.
      const raw = await rpc("rtdb_admin_get", { p_path: adminPath(path) });
      if (raw === null || raw === undefined) return null;
      if (typeof raw !== "object") return raw;
      const keys = Object.entries(raw as Record<string, unknown>).filter(([, child]) => firebaseValue(child) !== null).map(([key]) => key);
      return keys.length ? Object.fromEntries(keys.sort(compareKeys).map((key) => [key, true])) : null;
    },
    async transaction(path, update) {
      let current = await readRaw(path);
      // Firebase 처럼 충돌하면 최신 값으로 다시 계산한다(최대 25번).
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const next = update(firebaseValue(current.value));
        if (next === undefined) return { committed: false, value: firebaseValue(current.value) };
        const result = await rawCas(path, current.hash, next);
        if (result.committed) return { committed: true, value: firebaseValue(result.value) };
        current = result;
      }
      throw new AdminError("maxretry");
    },
    async readHashed(path) {
      const result = await readRaw(path);
      return { value: firebaseValue(result.value), hash: result.hash };
    },
    async compareAndSet(path, expectedHash, value) {
      const result = await rawCas(path, expectedHash, value);
      return { ...result, value: firebaseValue(result.value) };
    },
  };
}

const INVALID_TOKEN_CODES = new Set(["bad_jwt", "session_not_found", "session_expired", "user_not_found", "no_authorization", "user_banned", "refresh_token_not_found"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authFailure(error: { code?: unknown; status?: unknown }): AdminError {
  const status = typeof error.status === "number" ? error.status : 0;
  const code = typeof error.code === "string" ? error.code : "";
  return new AdminError(INVALID_TOKEN_CODES.has(code) || status === 401 || status === 403 || status === 404 ? "invalid_token" : "auth_unavailable");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createAuth(service: SupabaseClient, config: Config): PraiseAdminAuth {
  async function findUserIdByEmail(email: string): Promise<string | null> {
    // 관리자 API 에 이메일 조회가 없어 쪽 단위로 찾는다(고등부 계정 수백 명 규모).
    for (let page = 1; page <= 50; page += 1) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new AdminError("auth_unavailable");
      const found = data.users.find((user) => user.email?.toLowerCase() === email);
      if (found) return found.id;
      if (data.users.length < 1000) return null;
    }
    throw new AdminError("auth_unavailable");
  }
  async function update(id: string, password: string) {
    const { error } = await service.auth.admin.updateUserById(id, { password, email_confirm: true });
    if (error) throw new AdminError(error.code === "weak_password" ? "weak_password" : "auth_unavailable");
  }
  return {
    async verifyAccessToken(token) {
      const { data, error } = await service.auth.getUser(token);
      if (error) throw authFailure(error);
      const user = data.user;
      if (!user) throw new AdminError("invalid_token");
      // 규칙 uid 는 그 사용자 토큰으로 부른 whoami 가 원천이다(uid_map 변환 포함).
      const asUser = createClient(config.url, config.anonKey, { auth: SERVER_AUTH, global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: rows, error: whoamiError } = await asUser.schema("api").rpc("rtdb_whoami");
      if (whoamiError) throw new AdminError(/^PGRST30/.test(String(whoamiError.code ?? "")) ? "invalid_token" : "auth_unavailable");
      const row = (Array.isArray(rows) ? rows[0] : rows) as { uid?: unknown; email?: unknown; name?: unknown } | undefined;
      const uid = text(row?.uid);
      if (!uid) throw new AdminError("invalid_token");
      return {
        uid,
        email: text(row?.email)?.toLowerCase() ?? null,
        name: text(row?.name),
        supabaseId: user.id,
        anonymous: user.is_anonymous === true,
        disabled: Boolean(user.banned_until && Date.parse(user.banned_until) > Date.now()),
      };
    },
    async accountStatus(uid) {
      if (!UUID.test(uid)) return "unverifiable";
      const { data, error } = await service.auth.admin.getUserById(uid);
      if (error) {
        if (error.status === 404 || error.code === "user_not_found") return "missing";
        throw new AdminError("auth_unavailable");
      }
      const bannedUntil = data.user?.banned_until;
      return bannedUntil && Date.parse(bannedUntil) > Date.now() ? "disabled" : "active";
    },
    async setPassword(email, password) {
      const existing = await findUserIdByEmail(email);
      if (existing) {
        await update(existing, password);
        return { created: false };
      }
      const { error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (!error) return { created: true };
      if (error.code === "weak_password") throw new AdminError("weak_password");
      if (error.code !== "email_exists" && error.code !== "user_already_exists" && error.status !== 422) throw new AdminError("auth_unavailable");
      // 동시에 만들어졌으면 그 계정의 비밀번호를 정한다.
      const raced = await findUserIdByEmail(email);
      if (!raced) throw new AdminError("auth_unavailable");
      await update(raced, password);
      return { created: false };
    },
  };
}

let cached: { key: string; admin: PraiseAdmin } | null = null;

export function getPraiseAdmin(): PraiseAdmin {
  const config = configuration();
  const key = `${config.url}\n${config.anonKey}\n${config.serviceKey}`;
  if (cached?.key === key) return cached.admin;
  try {
    const service = createClient(config.url, config.serviceKey, { auth: SERVER_AUTH });
    const admin = { database: createDatabase(service), auth: createAuth(service, config) };
    cached = { key, admin };
    return admin;
  } catch {
    throw praiseUnavailable("server_not_configured");
  }
}
