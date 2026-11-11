// Firebase `onDisconnect()` 자리 — 출석부 복사본에만 있다(고등부 앱은 쓰지 않는다).
//
// Firebase 는 서버가 연결 끊김을 알아 미리 등록한 쓰기를 대신 한다. Supabase 에는 그런 장치가 없으므로
// 등록한 쓰기를 이 탭 메모리에 두었다가, 페이지가 실제로 닫힐 때(pagehide) keepalive 요청 한 번으로
// `api.rtdb_update` 에 보낸다. 최선 노력이다: 탭 강제 종료·브라우저 충돌·전원 끊김·먼저 끊긴 네트워크에서는
// 보내지 못한다. 그때 남는 잠금은 호출부의 만료·해제 장치(학생 이동 10분 만료 복구 등)가 맡는다.
//
// beforeunload 는 쓰지 않는다. "저장하지 않은 내용이 있습니다" 확인창(AppProvider·교사 초안)에서 사용자가
// 머무르기를 고르면 페이지는 살아 있는데 잠금만 풀리기 때문이다. pagehide 는 페이지가 정말 내려갈 때만 온다
// (뒤로 가기 캐시에 들어갈 때도 오는데, Firebase 도 그때 연결이 끊겨 같은 쓰기를 한다).
//
// 등록·취소 규칙은 Firebase SparseSnapshotTree 와 같다: update 는 자식 경로마다 따로 기억하고,
// cancel(path) 는 그 위치와 아래 예약을 지운다. 조상에 set 한 값이 있으면 그 값 안에서 고친다.
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { writeDeniedError } from "./errors";
import { isAncestorOrSelf, joinPath, pathSegments, relativePath, validateWritablePath } from "./path";
import { asReference, type DatabaseReference } from "./reference";
import { toServerJson, validateData, validateUpdateValues } from "./values";

export interface OnDisconnect {
  set(value: unknown): Promise<void>;
  update(values: object): Promise<void>;
  remove(): Promise<void>;
  cancel(): Promise<void>;
}

/** 등록 때 세션 토큰을 얻고, 페이지가 닫힐 때 패치를 보낸다. 시험은 가짜를 끼운다. */
export interface DisconnectTransport {
  /** 지금 로그인 세션의 접근 토큰. 로그인하지 않았으면 null. */
  accessToken(): Promise<string | null>;
  /** 응답을 기다리지 않고 한 번 보낸다(페이지가 닫히는 중이다). */
  send(patch: Record<string, unknown>, accessToken: string): void;
}

type Json = Record<string, unknown>;

function isBranchValue(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !Object.prototype.hasOwnProperty.call(value, ".sv");
}

/** JSON 값 안의 relative 위치를 child 로 바꾼 새 값(잎이면 객체로 바꾼다 — Firebase updateChild 와 같다). */
function withChild(value: unknown, relative: string, child: unknown): unknown {
  const keys = pathSegments(relative);
  if (keys.length === 0) return child;
  const [head, ...rest] = keys;
  const base: Json = isBranchValue(value) ? { ...value } : {};
  const next = withChild(base[head] ?? null, rest.join("/"), child);
  if (next === null) delete base[head];
  else base[head] = next;
  return base;
}

export class DisconnectRegistry {
  /** 서로 겹치지 않는 경로 → 닫힐 때 쓸 값(서버 JSON, null 은 지우기). */
  private readonly entries = new Map<string, unknown>();
  private token: string | null = null;
  private chain: Promise<void> = Promise.resolve();
  private listening = false;

  constructor(private readonly transport: DisconnectTransport) {}

  /** Firebase 처럼 등록·취소를 부른 순서대로 처리한다. */
  private enqueue(task: () => Promise<void> | void): Promise<void> {
    const run = this.chain.then(task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  register(writes: Array<[string, unknown]>): Promise<void> {
    return this.enqueue(async () => {
      let token: string | null = null;
      try {
        token = await this.transport.accessToken();
      } catch {
        token = null;
      }
      // 로그인 세션이 없으면 닫힐 때 보낼 수 없다 — Firebase 의 권한 거부처럼 등록을 실패시킨다.
      if (!token) throw writeDeniedError("onDisconnect: no session");
      this.token = token;
      for (const [path, value] of writes) this.remember(path, value);
      this.listen();
    });
  }

  cancel(path: string): Promise<void> {
    return this.enqueue(() => this.forget(path));
  }

  /** 페이지가 닫힐 때 한 번 보낸다. 보낸 예약은 Firebase 처럼 소비된다. */
  flush(): void {
    if (this.entries.size === 0) return;
    const patch = Object.fromEntries(this.entries);
    this.entries.clear();
    const token = this.token;
    if (!token) return;
    try {
      this.transport.send(patch, token);
    } catch {
      // 닫히는 중의 오류는 화면에 알릴 곳이 없다.
    }
  }

  /** @internal 시험: 지금 예약된 쓰기. */
  get _entries(): Record<string, unknown> {
    return Object.fromEntries(this.entries);
  }

  private remember(path: string, value: unknown): void {
    for (const [existing, current] of this.entries) {
      if (existing !== path && isAncestorOrSelf(existing, path)) {
        this.entries.set(existing, withChild(current, relativePath(existing, path), value));
        return;
      }
    }
    for (const existing of [...this.entries.keys()]) if (isAncestorOrSelf(path, existing)) this.entries.delete(existing);
    this.entries.set(path, value);
  }

  private forget(path: string): void {
    for (const [existing, current] of this.entries) {
      if (existing === path || !isAncestorOrSelf(existing, path)) continue;
      // 조상에 잎 값이 있으면 지울 자식이 없다(Firebase 와 같다).
      if (!isBranchValue(current)) return;
      this.entries.delete(existing);
      for (const [key, child] of Object.entries(current)) this.remember(joinPath(existing, key), child);
      this.forget(path);
      return;
    }
    for (const existing of [...this.entries.keys()]) if (isAncestorOrSelf(path, existing)) this.entries.delete(existing);
  }

  private listen(): void {
    if (this.listening || typeof window === "undefined") return;
    this.listening = true;
    window.addEventListener("pagehide", () => this.flush());
  }
}

/** 브라우저 기본 전송: 페이지가 내려가도 끝까지 가도록 keepalive POST 를 PostgREST RPC 로 직접 보낸다. */
export const keepaliveTransport: DisconnectTransport = {
  async accessToken() {
    if (!isSupabaseConfigured()) return null;
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  },
  send(patch, accessToken) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!base || !anonKey || typeof fetch !== "function") return;
    void fetch(`${base}/rest/v1/rpc/rtdb_update`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Profile": "api",
      },
      body: JSON.stringify({ p_patch: patch }),
    }).catch(() => undefined);
  },
};

const registries = new WeakMap<object, DisconnectRegistry>();

/** 시험·도구용: db(저장소)마다 전송을 바꿔 끼운다. 기존 예약은 버린다. */
export function setDisconnectTransport(repo: object, transport: DisconnectTransport): DisconnectRegistry {
  const registry = new DisconnectRegistry(transport);
  registries.set(repo, registry);
  return registry;
}

function registryFor(repo: object): DisconnectRegistry {
  let registry = registries.get(repo);
  if (!registry) {
    registry = new DisconnectRegistry(keepaliveTransport);
    registries.set(repo, registry);
  }
  return registry;
}

export function onDisconnect(reference: DatabaseReference): OnDisconnect {
  const target = asReference("onDisconnect", reference);
  validateWritablePath("onDisconnect", target._path);
  const path = target._path;
  const registry = registryFor(target._repo);
  return {
    set(value: unknown) {
      validateData("OnDisconnect.set", value);
      return registry.register([[path, toServerJson(value)]]);
    },
    update(values: object) {
      const entries = validateUpdateValues("OnDisconnect.update", values)
        .map(([key, value]) => [joinPath(path, key), toServerJson(value)] as [string, unknown]);
      return registry.register(entries);
    },
    remove() {
      return registry.register([[path, null]]);
    },
    cancel() {
      return registry.cancel(path);
    },
  };
}
