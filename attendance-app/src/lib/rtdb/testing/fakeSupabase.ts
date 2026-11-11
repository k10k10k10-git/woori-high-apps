// 시험용 가짜 Supabase: 계약 1장의 api.rtdb_* 와 Realtime(rtdb.changes INSERT)을 메모리로 흉내 낸다.
// 실제 DB·네트워크에 접속하지 않는다.
import { normalizePath } from "../path";
import { getChild, normalize, setChild, type Node } from "../tree";
import type { RealtimeChannelLike, RpcBuilder, RpcResponse, SupabaseLike } from "../transport";

type Rule = (path: string) => boolean;

export interface FakeCall {
  fn: string;
  args: Record<string, unknown>;
}

interface FakeChannel extends RealtimeChannelLike {
  handlers: Array<(payload: { new?: unknown }) => void>;
  status?: (status: string, error?: Error) => void;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

const copy = <T>(value: T): T => (value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)));

export class FakeSupabase implements SupabaseLike {
  data: Node = null;
  online = true;
  /** 읽기 거부 규칙(경로 → 거부 여부). 조상 경로에서 허용되면 Firebase 처럼 아래도 읽을 수 있다고 보지 않고, 경로마다 그대로 판정한다. */
  denyRead: Rule = () => false;
  denyWrite: Rule = () => false;
  invalidWrite: Rule = () => false;
  /** 변경 알림을 자동으로 보낼지(끄면 시험이 emitChange 로 직접 보낸다). */
  autoNotify = true;
  serverNow = 1_700_000_000_000;
  readonly calls: FakeCall[] = [];
  readonly channels: FakeChannel[] = [];
  private changeId = 0;
  private held: Array<{ fn: string; resume: () => void }> | null = null;
  /** 로그아웃처럼 함수 실행 자체가 거부된다(42501 permission denied for function). */
  signedOut = false;
  /** 이 함수들은 서버 오류(함수 없음)로 실패한다. */
  readonly brokenFunctions = new Set<string>();
  /** cas 가 이 횟수만큼 다른 사람이 먼저 쓴 것처럼 실패한다. */
  casConflicts = 0;
  casConflictValue: unknown = undefined;

  constructor(initial?: unknown) {
    this.data = normalize(initial ?? null);
  }

  // ── 시험 조작 ──

  /** 응답을 붙잡아 둔다. release() 때 순서대로 돌려준다. */
  hold(): void {
    this.held = [];
  }

  release(): void {
    const pending = this.held ?? [];
    this.held = null;
    pending.forEach(({ resume }) => resume());
  }

  /** 붙잡은 응답 중 fn 호출만 먼저 돌려준다(붙잡기는 계속). */
  releaseOnly(fn: string): void {
    if (!this.held) return;
    const [matched, rest] = [this.held.filter((entry) => entry.fn === fn), this.held.filter((entry) => entry.fn !== fn)];
    this.held = rest;
    matched.forEach(({ resume }) => resume());
  }

  get heldCount(): number {
    return this.held?.length ?? 0;
  }

  callsOf(fn: string): FakeCall[] {
    return this.calls.filter((call) => call.fn === fn);
  }

  /** 다른 사용자가 서버에 쓴 것처럼 데이터를 바꾸고 알림을 보낸다. */
  externalWrite(patch: Record<string, unknown>): number {
    for (const [path, value] of Object.entries(patch)) this.data = setChild(this.data, normalizePath(path), normalize(value));
    return this.recordChange(Object.keys(patch).map(normalizePath));
  }

  emitChange(paths: string[] | null, id = ++this.changeId): void {
    for (const channel of this.channels) channel.handlers.forEach((handler) => handler({ new: { id, at: new Date().toISOString(), paths } }));
  }

  setRealtimeStatus(status: "SUBSCRIBED" | "CHANNEL_ERROR" | "CLOSED" | "TIMED_OUT"): void {
    for (const channel of this.channels) channel.status?.(status);
  }

  value(path = ""): unknown {
    return copy(getChild(this.data, normalizePath(path)));
  }

  // ── SupabaseLike ──

  schema(name: string) {
    if (name !== "api") throw new Error(`unexpected schema ${name}`);
    return { rpc: (fn: string, args: Record<string, unknown> = {}) => this.rpc(fn, args) };
  }

  channel(): RealtimeChannelLike {
    const channel: FakeChannel = {
      handlers: [],
      on: (_type, filter, callback) => {
        if (filter.schema !== "rtdb" || filter.table !== "changes" || filter.event !== "INSERT") throw new Error("unexpected realtime filter");
        channel.handlers.push(callback);
        return channel;
      },
      subscribe: (callback) => {
        channel.status = callback;
        return channel;
      },
    };
    this.channels.push(channel);
    return channel;
  }

  removeChannel(channel: RealtimeChannelLike): void {
    const index = this.channels.indexOf(channel as FakeChannel);
    if (index >= 0) this.channels.splice(index, 1);
  }

  private rpc(fn: string, args: Record<string, unknown>): RpcBuilder {
    this.calls.push({ fn, args: copy(args) });
    const run = async (): Promise<RpcResponse> => {
      if (this.held) await new Promise<void>((resolve) => this.held!.push({ fn, resume: resolve }));
      if (this.signedOut) return { data: null, error: { code: "42501", message: `permission denied for function ${fn}` }, status: 401 };
      if (this.brokenFunctions.has(fn)) return { data: null, error: { code: "PGRST202", message: `Could not find the function api.${fn}` }, status: 404 };
      if (!this.online) return { data: null, error: { message: "TypeError: Failed to fetch", code: "", details: "", hint: "" }, status: 0 };
      try {
        return { data: this.execute(fn, args), error: null, status: 200 };
      } catch (error) {
        const { code, message } = error as { code: string; message: string };
        return { data: null, error: { code, message }, status: code === "42501" ? 403 : 400 };
      }
    };
    const promise = run();
    return { then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected) };
  }

  private fail(code: string, message: string): never {
    throw Object.assign(new Error(message), { code });
  }

  private read(path: string): unknown {
    if (this.denyRead(path)) this.fail("42501", "permission_denied");
    return copy(getChild(this.data, path));
  }

  private resolve(value: unknown, existing: Node): unknown {
    if (value === null || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    if (".sv" in record) {
      const sv = record[".sv"];
      if (sv === "timestamp") return this.serverNow;
      const delta = (sv as { increment?: number }).increment ?? 0;
      return typeof existing === "number" ? existing + delta : delta;
    }
    return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, this.resolve(child, getChild(existing, key))]));
  }

  private applyPatch(patch: Record<string, unknown>): string[] {
    const paths = Object.keys(patch).map(normalizePath);
    for (const path of paths) if (this.denyWrite(path)) this.fail("42501", `permission_denied:${path}`);
    for (const path of paths) if (this.invalidWrite(path)) this.fail("23514", `validation_failed:${path}`);
    for (const [key, value] of Object.entries(patch)) {
      const path = normalizePath(key);
      this.data = setChild(this.data, path, normalize(this.resolve(value, getChild(this.data, path))));
    }
    return paths;
  }

  private recordChange(paths: string[]): number {
    const id = ++this.changeId;
    if (this.autoNotify) setTimeout(() => this.emitChange(paths, id), 0);
    return id;
  }

  private hashOf(path: string): string {
    return stable(getChild(this.data, path));
  }

  private execute(fn: string, args: Record<string, unknown>): unknown {
    switch (fn) {
      case "rtdb_get":
        return this.read(normalizePath(String(args.p_path)));
      case "rtdb_get_many": {
        const out: Record<string, unknown> = {};
        for (const raw of args.p_paths as string[]) {
          const path = normalizePath(raw);
          out[raw] = this.denyRead(path) ? { __denied: true } : copy(getChild(this.data, path));
        }
        return out;
      }
      case "rtdb_get_hashed": {
        const path = normalizePath(String(args.p_path));
        return { value: this.read(path), hash: this.hashOf(path) };
      }
      case "rtdb_update": {
        const paths = this.applyPatch(args.p_patch as Record<string, unknown>);
        return { ok: true, change: this.recordChange(paths) };
      }
      case "rtdb_cas": {
        const path = normalizePath(String(args.p_path));
        if (this.casConflicts > 0) {
          this.casConflicts -= 1;
          if (this.casConflictValue !== undefined) this.data = setChild(this.data, path, normalize(this.casConflictValue));
          return { committed: false, value: copy(getChild(this.data, path)), hash: this.hashOf(path) };
        }
        if (this.hashOf(path) !== args.p_expected) return { committed: false, value: copy(getChild(this.data, path)), hash: this.hashOf(path) };
        this.applyPatch({ [path]: args.p_value });
        this.recordChange([path]);
        return { committed: true, value: copy(getChild(this.data, path)), hash: this.hashOf(path) };
      }
      default:
        return this.fail("PGRST202", `function ${fn} not found`);
    }
  }
}

