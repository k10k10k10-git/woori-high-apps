// Supabase RPC(`api.rtdb_*`)·Realtime 연결부. 계약: docs/SUPABASE_PLATFORM_CONTRACT.md 1장.
// supabase-js 의 제네릭 타입 대신 이 모듈이 쓰는 최소 모양만 적어, 시험에서 가짜 클라이언트를 끼울 수 있게 한다.

export interface RpcError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface RpcResponse {
  data: unknown;
  error: RpcError | null;
  status?: number;
}

export interface RpcBuilder extends PromiseLike<RpcResponse> {
  abortSignal?(signal: AbortSignal): unknown;
}

export interface RealtimeChannelLike {
  on(type: "postgres_changes", filter: { event: string; schema: string; table: string }, callback: (payload: { new?: unknown }) => void): RealtimeChannelLike;
  subscribe(callback?: (status: string, error?: Error) => void): unknown;
}

export interface SupabaseLike {
  schema(name: string): { rpc(fn: string, args?: Record<string, unknown>): RpcBuilder };
  channel(name: string, options?: Record<string, unknown>): RealtimeChannelLike;
  removeChannel?(channel: RealtimeChannelLike): unknown;
  auth?: {
    getSession?(): Promise<{ data: { session: unknown }; error: unknown }>;
    onAuthStateChange?(callback: (event: string, session: { user?: { id?: string } } | null) => void): unknown;
  };
}

/** network: 다시 보내면 되는 실패(연결 끊김·시간 초과·일시적 5xx). denied/invalid: 규칙 거부. */
export type RpcFailureKind = "network" | "denied" | "invalid" | "error";
export type RpcOutcome<T> = { ok: true; data: T } | { ok: false; kind: RpcFailureKind; message: string; code: string };

const TRANSIENT_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|aborterror|timeouterror|econn|enotfound|etimedout/i;
// SQLSTATE 중 다시 보내면 풀리는 것: 연결(08)·자원 부족(53)·운영자 개입(57P)·직렬화 충돌·교착·문장 시간 초과.
const TRANSIENT_SQLSTATE = /^(08|53|57P|40001$|40P01$|57014$)/;
// PostgREST 의 DB 연결 실패 계열.
const TRANSIENT_POSTGREST = /^PGRST00[0-3]$/;

export function classifyRpcError(error: RpcError, status: number | undefined): RpcFailureKind {
  const code = error.code ?? "";
  if (code === "42501") return "denied";
  if (code === "23514") return "invalid";
  // DB 가 이유를 붙여 거절한 오류는 다시 보내도 같다 — 대기열을 막지 않게 바로 실패시킨다.
  if (/^[0-9A-Z]{5}$/.test(code)) return TRANSIENT_SQLSTATE.test(code) ? "network" : "error";
  if (code.startsWith("PGRST")) return TRANSIENT_POSTGREST.test(code) ? "network" : "error";
  if (status !== undefined && TRANSIENT_STATUS.has(status)) return "network";
  if ((status === undefined || status === 0) && NETWORK_MESSAGE.test(error.message ?? "")) return "network";
  return "error";
}

const RPC_TIMEOUT_MS = 30_000;

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(RPC_TIMEOUT_MS) : undefined;
}

function isRetryableAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, status } = error as { name?: string; status?: number };
  return name === "AuthRetryableFetchError" || status === 0 || (typeof status === "number" && status >= 500);
}

export class RtdbTransport {
  constructor(private readonly client: () => SupabaseLike) {}

  /** 쓰기 전에 로그인 세션 복원·갱신을 기다린다. 갱신이 네트워크로 실패하면 익명으로 보내 거부되지 않게 다시 시도한다. */
  private async sessionReady(): Promise<RpcOutcome<null>> {
    const auth = this.client().auth;
    if (!auth?.getSession) return { ok: true, data: null };
    try {
      const { error } = await auth.getSession();
      if (error && isRetryableAuthError(error)) return { ok: false, kind: "network", message: "session refresh failed", code: "" };
    } catch (error) {
      if (isRetryableAuthError(error)) return { ok: false, kind: "network", message: "session refresh failed", code: "" };
    }
    return { ok: true, data: null };
  }

  private async call<T>(fn: string, args: Record<string, unknown>, needsSession = false): Promise<RpcOutcome<T>> {
    let response: RpcResponse;
    try {
      if (needsSession) {
        const ready = await this.sessionReady();
        if (!ready.ok) return ready;
      }
      const builder = this.client().schema("api").rpc(fn, args);
      const signal = timeoutSignal();
      if (signal && typeof builder.abortSignal === "function") builder.abortSignal(signal);
      response = await builder;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return { ok: false, kind: NETWORK_MESSAGE.test(message) ? "network" : "error", message, code: "" };
    }
    if (response.error) {
      return {
        ok: false,
        kind: classifyRpcError(response.error, response.status),
        message: response.error.message ?? "",
        code: response.error.code ?? "",
      };
    }
    return { ok: true, data: response.data as T };
  }

  get(path: string): Promise<RpcOutcome<unknown>> {
    return this.call("rtdb_get", { p_path: path });
  }

  getMany(paths: string[]): Promise<RpcOutcome<Record<string, unknown> | null>> {
    return this.call("rtdb_get_many", { p_paths: paths });
  }

  getHashed(path: string): Promise<RpcOutcome<{ value: unknown; hash: string } | null>> {
    return this.call("rtdb_get_hashed", { p_path: path }, true);
  }

  update(patch: Record<string, unknown>): Promise<RpcOutcome<{ ok?: boolean; change?: number | string | null } | null>> {
    return this.call("rtdb_update", { p_patch: patch }, true);
  }

  cas(path: string, expected: string, value: unknown): Promise<RpcOutcome<{ committed: boolean; value: unknown; hash: string } | null>> {
    return this.call("rtdb_cas", { p_path: path, p_expected: expected, p_value: value }, true);
  }
}
