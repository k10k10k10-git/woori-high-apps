// RTDB 저장소 엔진 — Firebase SDK 의 Repo·SyncTree 자리를 Supabase RPC + Realtime 로 채운다.
//
// 데이터 세 겹:
//  1) serverRoot: 서버에서 읽어 온 트리. 구독 중인 위치("뿌리")만 들고 있고, 구독이 끝나면 버린다.
//  2) overlays: 아직 서버가 확인하지 않은 쓰기(pending)와, 확인됐지만 새로 읽기 전인 쓰기(acked).
//     화면 값 = serverRoot 위에 overlays 를 순서대로 덮은 것. 그래서 쓰기는 즉시 보이고, 거부되면 빠진다.
//  3) views: 같은 경로·같은 query 의 구독 묶음. 값이 바뀔 때마다 이전 값과 비교해 이벤트를 만든다.
//
// 서버와 맞추기: Realtime 으로 `rtdb.changes` INSERT(바뀐 경로)를 받으면, 겹치는 뿌리만 다시 읽는다.
// 뿌리 아래 경로가 바뀌면 그 경로만 읽어 끼워 넣는다(splice). 읽기는 한 번에 하나씩, 짧게 묶어서 보낸다
// — 그래서 늦게 보낸 읽기가 먼저 보낸 읽기에 덮이지 않는다.
import { getDeniedError, listenDeniedError, offlineError, rtdbError, transactionError, writeDeniedError } from "./errors";
import { nodeToValue } from "./ordering";
import { isAncestorOrSelf, isInfoPath, normalizePath, pathSegments, pathsOverlap, relativePath } from "./path";
import { applyQuery, orderedKeys, type QueryParams } from "./queryParams";
import { ReferenceImpl, type QueryImpl, type RepoHandle } from "./reference";
import { DataSnapshot } from "./snapshot";
import { deepEqual, getChild, isBranch, normalize, reconcile, setChild, type Node } from "./tree";
import { RtdbTransport, type RealtimeChannelLike, type RpcOutcome, type SupabaseLike } from "./transport";
import { resolveLocally, toServerJson, validateData } from "./values";

export type ListenerType = "value" | "child_added" | "child_changed" | "child_removed";
export type ListenerCallback = (snapshot: DataSnapshot, previousChildName?: string | null) => unknown;

export interface RepoOptions {
  /** Supabase 클라이언트. 처음 쓸 때 부른다(환경 변수가 없어도 import 만으로는 실패하지 않게). */
  client: () => SupabaseLike;
  /** DatabaseReference.toString() 앞부분. */
  url?: string;
  /** Realtime 구독을 켤지. 기본: 브라우저에서만. */
  realtime?: boolean;
  /** online/offline·로그인 변경 감시. 기본: 브라우저에서만. */
  watchEnvironment?: boolean;
  /** 변경 알림을 묶는 시간(ms). */
  refreshDelayMs?: number;
  /** n 번째 재시도 전 대기(ms). */
  retryDelayMs?: (attempt: number) => number;
  /** 로컬 반영과 push ID 에 쓰는 시각. */
  now?: () => number;
}

export class TransactionResult {
  constructor(readonly committed: boolean, readonly snapshot: DataSnapshot) {}

  toJSON(): object {
    return { committed: this.committed, snapshot: this.snapshot.toJSON() };
  }
}

interface Registration {
  readonly type: ListenerType;
  readonly callback: ListenerCallback;
  readonly cancel?: (error: Error) => unknown;
  readonly onlyOnce: boolean;
  readonly view: View;
  active: boolean;
  initialized: boolean;
}

interface View {
  readonly id: string;
  readonly path: string;
  readonly params: QueryParams;
  readonly registrations: Registration[];
  /** 마지막으로 알린 값(query 적용 후). undefined 면 아직 알린 적 없음. */
  last: Node | undefined;
}

interface Overlay {
  entries: Array<[string, Node]>;
  state: "pending" | "acked";
  /** 이 번호 이상의 새로고침이 끝나면 서버 값이 이 쓰기를 담고 있다. */
  confirmSeq: number;
}

interface QueueItem {
  run(): Promise<void>;
}

const DENIED_MARKER = "__denied";
/** 한 뿌리 아래 바뀐 경로가 이보다 많으면 뿌리 전체를 다시 읽는다. */
const SPLICE_LIMIT = 20;
const MAX_TRANSACTION_TRIES = 25;
const MAX_REMEMBERED_CHANGES = 1000;
/** get() 이 끊김을 만나면 Firebase 처럼 잠깐(약 3초) 다시 시도한 뒤 포기한다. */
const GET_RETRIES = 2;

const defaultRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000);

function isDenied(value: unknown): boolean {
  return isBranch(value as Node) && (value as Record<string, unknown>)[DENIED_MARKER] === true;
}

/** 서로 덮지 않는 경로만 남긴다. */
function withoutCovered(paths: string[]): string[] {
  const unique = [...new Set(paths)];
  return unique.filter((path) => !unique.some((other) => other !== path && isAncestorOrSelf(other, path)));
}

/**
 * 한 뿌리 아래 바뀐 경로가 많으면 가장 깊은 것부터 부모로 올려 SPLICE_LIMIT 개 이하로 줄인다.
 * 예: 참가자 127명 일괄 저장 → `retreats/x/participants` 하나만 읽는다(뿌리 `retreats` 전체가 아니라).
 */
function coarsen(root: string, paths: string[]): string[] {
  let list = withoutCovered(paths);
  const rootDepth = pathSegments(root).length;
  while (list.length > SPLICE_LIMIT) {
    const depth = Math.max(...list.map((path) => pathSegments(path).length));
    if (depth <= rootDepth + 1) return [root];
    list = withoutCovered(list.map((path) => (pathSegments(path).length === depth ? path.slice(0, path.lastIndexOf("/")) : path)));
  }
  return list.includes(root) ? [root] : list;
}

let channelCounter = 0;

export class Repo implements RepoHandle {
  readonly url: string;
  private readonly client: () => SupabaseLike;
  private readonly transport: RtdbTransport;
  private readonly realtimeEnabled: boolean;
  private readonly watchEnvironment: boolean;
  private readonly refreshDelayMs: number;
  private readonly retryDelayMs: (attempt: number) => number;
  readonly now: () => number;

  private serverRoot: Node = null;
  private infoRoot: Node = { ".info": { connected: false, serverTimeOffset: 0 } };
  private readonly views = new Map<string, View>();
  private roots: string[] = [];
  private readonly loaded = new Set<string>();
  private overlays: Overlay[] = [];

  private readonly queue: QueueItem[] = [];
  private pumping = false;

  private readonly dirty = new Set<string>();
  private inFlight: Set<string> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshDueAt = Infinity;
  private refreshFailures = 0;
  private nextSeq = 1;
  private completedSeq = 0;

  private readonly events: Array<() => void> = [];
  private draining = false;

  private started = false;
  private disposed = false;
  private channel: RealtimeChannelLike | null = null;
  private realtimeSubscribed = false;
  private browserOnline = true;
  private networkOffline = false;
  private infoConnected = false;
  private retryWaiters: Array<() => void> = [];
  private readonly cleanups: Array<() => void> = [];
  /** Realtime 으로 먼저 본 변경 번호 → 그 변경을 담는 새로고침 번호. */
  private readonly notified = new Map<number, number>();
  /** 응답으로 먼저 받은 내 쓰기의 변경 번호(나중에 Realtime 으로 오면 다시 읽지 않는다). */
  private readonly ackedChanges = new Set<number>();
  private authUser: string | null | undefined = undefined;

  constructor(options: RepoOptions) {
    const browser = typeof window !== "undefined";
    this.transport = new RtdbTransport(options.client);
    this.client = options.client;
    this.url = options.url ?? "rtdb:";
    this.realtimeEnabled = options.realtime ?? browser;
    this.watchEnvironment = options.watchEnvironment ?? browser;
    this.refreshDelayMs = options.refreshDelayMs ?? 30;
    this.retryDelayMs = options.retryDelayMs ?? defaultRetryDelay;
    this.now = options.now ?? Date.now;
  }

  // ── 시작·정리 ─────────────────────────────────────────────

  /** Realtime·환경 감시를 켠다. 여러 번 불러도 한 번만 한다. */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    if (this.watchEnvironment && typeof window !== "undefined") {
      this.browserOnline = typeof navigator === "undefined" || navigator.onLine !== false;
      const online = () => {
        this.browserOnline = true;
        this.setNetworkOffline(false);
        this.refreshAllRoots();
      };
      const offline = () => {
        this.browserOnline = false;
        this.updateInfo();
      };
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      this.cleanups.push(() => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
      });
    }
    if (this.watchEnvironment) this.watchAuth();
    if (this.realtimeEnabled) this.startRealtime();
  }

  private watchAuth(): void {
    try {
      const subscription = this.client().auth?.onAuthStateChange?.((_event, session) => {
        const uid = session?.user?.id ?? null;
        if (this.authUser === undefined) {
          this.authUser = uid;
          return;
        }
        if (uid === this.authUser) return;
        this.authUser = uid;
        // 로그인 사용자가 바뀌면 Firebase 처럼 모든 구독을 새 권한으로 다시 읽는다(거부되면 cancel).
        // supabase-js 는 이 콜백 안에서 다른 호출을 하면 막힐 수 있어 다음 차례로 미룬다.
        setTimeout(() => this.refreshAllRoots(), 0);
      }) as { data?: { subscription?: { unsubscribe?: () => void } } } | undefined;
      const unsubscribe = subscription?.data?.subscription?.unsubscribe;
      if (unsubscribe) this.cleanups.push(() => unsubscribe.call(subscription?.data?.subscription));
    } catch (error) {
      console.warn("[rtdb] 로그인 상태 감시를 시작하지 못했습니다.", error);
    }
  }

  private startRealtime(): void {
    if (this.channel) return;
    try {
      const client = this.client();
      channelCounter += 1;
      const channel = client.channel(`rtdb-changes-${channelCounter}`);
      channel.on("postgres_changes", { event: "INSERT", schema: "rtdb", table: "changes" }, (payload) => {
        this.onRealtimeChange(payload?.new);
      });
      channel.subscribe((status) => this.onRealtimeStatus(status));
      this.channel = channel;
      this.cleanups.push(() => {
        try {
          client.removeChannel?.(channel);
        } catch {
          // 정리 중 오류는 무시한다.
        }
      });
    } catch (error) {
      console.warn("[rtdb] 실시간 연결을 시작하지 못했습니다.", error);
    }
  }

  /** 시험·정리용: 타이머와 감시를 모두 끈다. */
  dispose(): void {
    this.disposed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.retryWaiters.splice(0).forEach((wake) => wake());
  }

  // ── 연결 상태 ─────────────────────────────────────────────

  private onRealtimeStatus(status: string): void {
    if (status === "SUBSCRIBED") {
      this.realtimeSubscribed = true;
      this.setNetworkOffline(false);
      this.updateInfo();
      // 끊긴 동안(또는 처음 연결 전) 놓친 변경이 있을 수 있으니 구독 중인 뿌리를 모두 다시 읽는다.
      this.refreshAllRoots();
      this.wakeRetries();
      return;
    }
    this.realtimeSubscribed = false;
    this.updateInfo();
  }

  private setNetworkOffline(offline: boolean): void {
    if (this.networkOffline === offline) return;
    this.networkOffline = offline;
    this.updateInfo();
    if (!offline) {
      this.wakeRetries();
      this.scheduleRefresh(0);
    }
  }

  private updateInfo(): void {
    const connected = this.realtimeSubscribed && this.browserOnline && !this.networkOffline;
    if (connected === this.infoConnected) return;
    this.infoConnected = connected;
    this.infoRoot = { ".info": { connected, serverTimeOffset: 0 } };
    this.recomputeOverlapping([".info"]);
    this.drain();
  }

  private waitBeforeRetry(attempt: number): Promise<void> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const wake = () => {
        if (timer) clearTimeout(timer);
        this.retryWaiters = this.retryWaiters.filter((waiter) => waiter !== wake);
        resolve();
      };
      if (this.disposed) {
        resolve();
        return;
      }
      timer = setTimeout(wake, this.retryDelayMs(attempt));
      this.retryWaiters.push(wake);
    });
  }

  private wakeRetries(): void {
    this.retryWaiters.slice().forEach((wake) => wake());
  }

  // ── 구독 ─────────────────────────────────────────────────

  addListener(query: QueryImpl, type: ListenerType, callback: ListenerCallback, cancel: ((error: Error) => unknown) | undefined, onlyOnce: boolean): () => void {
    this.start();
    const id = `${query._path}|${query._queryIdentifier}`;
    let view = this.views.get(id);
    const created = !view;
    if (!view) {
      view = { id, path: query._path, params: query._params, registrations: [], last: undefined };
      this.views.set(id, view);
    }
    const registration: Registration = { type, callback, cancel, onlyOnce, view, active: true, initialized: false };
    view.registrations.push(registration);
    if (created && !isInfoPath(view.path)) this.updateRoots();
    const target = view;
    // Firebase 는 이미 아는 값이면 등록 중에 바로 콜백을 부른다. 여기서는 등록 함수가 돌아간 뒤
    // (구독 해제 함수를 받은 뒤) 부르도록 한 박자 미룬다.
    queueMicrotask(() => this.initializeView(target));
    return () => this.removeRegistration(registration);
  }

  private initializeView(view: View): void {
    if (this.views.get(view.id) !== view) return;
    if (!view.registrations.some((registration) => registration.active && !registration.initialized)) return;
    if (!this.isComplete(view.path)) return;
    this.recomputeView(view);
    this.drain();
  }

  private removeRegistration(registration: Registration): void {
    registration.active = false;
    const { view } = registration;
    const index = view.registrations.indexOf(registration);
    if (index >= 0) view.registrations.splice(index, 1);
    if (view.registrations.length === 0 && this.views.get(view.id) === view) {
      this.views.delete(view.id);
      if (!isInfoPath(view.path)) this.updateRoots();
    }
  }

  private cancelView(view: View, error: Error): void {
    for (const registration of view.registrations) {
      if (!registration.active) continue;
      registration.active = false;
      const cancel = registration.cancel;
      if (cancel) this.events.push(() => cancel(error));
    }
    view.registrations.length = 0;
    if (this.views.get(view.id) === view) this.views.delete(view.id);
  }

  /** 구독 경로에서 서버에서 읽을 "뿌리"(다른 구독 경로 아래가 아닌 경로)를 다시 정한다. */
  private updateRoots(): void {
    const paths = [...new Set([...this.views.values()].map((view) => view.path).filter((path) => !isInfoPath(path)))]
      .sort((a, b) => pathSegments(a).length - pathSegments(b).length);
    const roots: string[] = [];
    for (const path of paths) if (!roots.some((root) => isAncestorOrSelf(root, path))) roots.push(path);
    for (const root of roots) {
      if (this.loaded.has(root)) continue;
      // 이미 읽어 둔 상위 구독이 있었다면 그 값이 아직 맞다 — 다시 읽지 않고 넘겨받는다.
      if (this.isLoadedCovered(root)) this.loaded.add(root);
      else if (!this.inFlight?.has(root)) this.dirty.add(root);
    }
    this.roots = roots;
    for (const mark of [...this.loaded]) {
      if (!roots.some((root) => isAncestorOrSelf(root, mark))) {
        this.loaded.delete(mark);
        this.pruneMark(mark, true);
      }
    }
    for (const mark of [...this.loaded]) {
      if (roots.some((root) => root !== mark && this.loaded.has(root) && isAncestorOrSelf(root, mark))) this.loaded.delete(mark);
    }
    for (const path of [...this.dirty]) {
      if (!roots.some((root) => pathsOverlap(root, path))) this.dirty.delete(path);
    }
    this.scheduleRefresh(this.refreshDelayMs);
  }

  /** 더 이상 구독하지 않는 위치의 서버 값을 버린다. keepRoots 면 그 아래 다른 뿌리 값은 남긴다. */
  private pruneMark(mark: string, keepRoots: boolean): void {
    const keep = keepRoots
      ? this.roots.filter((root) => root !== mark && isAncestorOrSelf(mark, root)).map((root) => [root, getChild(this.serverRoot, root)] as const)
      : [];
    this.serverRoot = setChild(this.serverRoot, mark, null);
    for (const [root, node] of keep) this.serverRoot = setChild(this.serverRoot, root, node);
  }

  private isLoadedCovered(path: string): boolean {
    for (const mark of this.loaded) if (isAncestorOrSelf(mark, path)) return true;
    return false;
  }

  /** 값을 알릴 수 있는가: 서버 값을 읽었거나, 그 위치 전체를 덮는 로컬 쓰기가 있다. */
  private isComplete(path: string): boolean {
    if (isInfoPath(path) || this.isLoadedCovered(path)) return true;
    return this.overlays.some((overlay) => overlay.entries.some(([written]) => isAncestorOrSelf(written, path)));
  }

  // ── 값 계산·이벤트 ──────────────────────────────────────

  /** 화면 값: 서버 값 위에 쓰기를 순서대로 덮는다. */
  private visible(path: string, includeAcked = true, base?: Node): Node {
    let node = base !== undefined ? base : getChild(isInfoPath(path) ? this.infoRoot : this.serverRoot, path);
    for (const overlay of this.overlays) {
      if (!includeAcked && overlay.state === "acked") continue;
      for (const [written, value] of overlay.entries) {
        if (isAncestorOrSelf(written, path)) node = getChild(value, relativePath(written, path));
        else if (isAncestorOrSelf(path, written)) node = setChild(node, relativePath(path, written), value);
      }
    }
    return node;
  }

  private recomputeOverlapping(paths: string[] | "all"): void {
    const targets = [...this.views.values()]
      .filter((view) => paths === "all" || paths.some((path) => pathsOverlap(path, view.path)))
      // Firebase 처럼 깊은 위치의 이벤트를 먼저 낸다.
      .sort((a, b) => pathSegments(b.path).length - pathSegments(a.path).length);
    for (const view of targets) this.recomputeView(view);
  }

  private recomputeView(view: View): void {
    if (this.views.get(view.id) !== view || !this.isComplete(view.path)) return;
    const node = applyQuery(this.visible(view.path), view.params);
    const previous = view.last;
    view.last = node;
    const active = view.registrations.filter((registration) => registration.active);
    const known = active.filter((registration) => registration.initialized);
    const fresh = active.filter((registration) => !registration.initialized);
    if (previous !== undefined && known.length > 0 && !deepEqual(previous, node)) this.queueEvents(view, previous, node, known, false);
    if (fresh.length > 0) {
      for (const registration of fresh) registration.initialized = true;
      this.queueEvents(view, null, node, fresh, true);
    }
  }

  private queueEvents(view: View, before: Node, after: Node, registrations: Registration[], initial: boolean): void {
    const reference = new ReferenceImpl(this, view.path);
    const { index } = view.params;
    const childListeners = registrations.filter((registration) => registration.type !== "value");
    if (childListeners.length > 0) {
      const beforeChildren = isBranch(before) ? before : {};
      const afterChildren = isBranch(after) ? after : {};
      const afterOrder = orderedKeys(after, index);
      const previousKey = (key: string) => {
        const position = afterOrder.indexOf(key);
        return position > 0 ? afterOrder[position - 1] : null;
      };
      const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
      const removed = orderedKeys(before, index).filter((key) => !has(afterChildren, key));
      const added = afterOrder.filter((key) => !has(beforeChildren, key));
      const changed = afterOrder.filter((key) => has(beforeChildren, key) && !deepEqual(beforeChildren[key], afterChildren[key]));
      const emit = (type: ListenerType, keys: string[], source: Record<string, Node>) => {
        for (const key of keys) {
          const snapshot = new DataSnapshot(source[key] ?? null, new ReferenceImpl(this, `${view.path ? `${view.path}/` : ""}${key}`));
          for (const registration of childListeners) {
            if (registration.type !== type) continue;
            this.queueCallback(registration, snapshot, type === "child_removed" ? undefined : previousKey(key));
          }
        }
      };
      emit("child_removed", removed, beforeChildren);
      emit("child_added", added, afterChildren);
      emit("child_changed", changed, afterChildren);
    }
    const valueSnapshot = new DataSnapshot(after, reference, index);
    for (const registration of registrations) {
      if (registration.type === "value" && (initial || !deepEqual(before, after))) this.queueCallback(registration, valueSnapshot);
    }
  }

  private queueCallback(registration: Registration, snapshot: DataSnapshot, previousKey?: string | null): void {
    this.events.push(() => {
      if (!registration.active) return;
      if (registration.onlyOnce) this.removeRegistration(registration);
      // Firebase 와 같은 인자: value 는 (snapshot, null), child_removed 는 (snapshot).
      if (registration.type === "child_removed") registration.callback(snapshot);
      else registration.callback(snapshot, registration.type === "value" ? null : previousKey ?? null);
    });
  }

  /** 모은 이벤트를 순서대로 부른다. 콜백 안의 쓰기·구독이 만든 이벤트는 뒤에 이어 붙는다. */
  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.events.length > 0) {
        const event = this.events.shift()!;
        try {
          event();
        } catch (error) {
          // Firebase exceptionGuard 처럼 한 콜백의 예외가 다른 콜백을 막지 않게 따로 던진다.
          setTimeout(() => {
            throw error;
          }, 0);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  // ── 읽기 ─────────────────────────────────────────────────

  async get(query: QueryImpl): Promise<DataSnapshot> {
    this.start();
    const { _path: path, _params: params } = query;
    const reference = new ReferenceImpl(this, path);
    if (isInfoPath(path)) return new DataSnapshot(applyQuery(this.visible(path), params), reference, params.index);
    // Firebase 처럼 구독 중이라 이미 아는 값이면 서버에 묻지 않는다. 다시 읽기를 기다리는 중이면 서버에 묻는다.
    if (this.isLoadedCovered(path) && !this.isStale(path)) {
      return new DataSnapshot(applyQuery(this.visible(path), params), reference, params.index);
    }
    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.transport.get(path);
      if (outcome.ok) {
        this.setNetworkOffline(false);
        const node = this.visible(path, false, normalize(outcome.data));
        return new DataSnapshot(applyQuery(node, params), reference, params.index);
      }
      if (outcome.kind === "denied" || outcome.kind === "invalid") throw getDeniedError(outcome.message);
      if (outcome.kind !== "network") throw rtdbError("UNKNOWN_ERROR", outcome.message || "get failed");
      this.setNetworkOffline(true);
      if (attempt >= GET_RETRIES) throw offlineError();
      await this.waitBeforeRetry(attempt);
    }
  }

  private isStale(path: string): boolean {
    for (const dirty of this.dirty) if (pathsOverlap(dirty, path)) return true;
    if (this.inFlight) for (const pending of this.inFlight) if (pathsOverlap(pending, path)) return true;
    return false;
  }

  // ── 서버 다시 읽기 ───────────────────────────────────────

  private refreshAllRoots(): void {
    for (const root of this.roots) this.dirty.add(root);
    this.scheduleRefresh(0);
  }

  /** 바뀐 경로 하나를 다시 읽을 목록에 넣는다(뿌리 아래면 그 경로, 뿌리 위면 뿌리). */
  private markChanged(path: string): void {
    for (const root of this.roots) {
      if (isAncestorOrSelf(root, path)) this.dirty.add(path);
      else if (isAncestorOrSelf(path, root)) this.dirty.add(root);
    }
  }

  private scheduleRefresh(delay: number): void {
    if (this.disposed || this.dirty.size === 0 || this.inFlight) return;
    const urgent = [...this.dirty].some((path) => this.roots.includes(path) && !this.loaded.has(path));
    const dueAt = Date.now() + (urgent ? 0 : delay);
    if (this.refreshTimer && this.refreshDueAt <= dueAt) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshDueAt = dueAt;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshDueAt = Infinity;
      void this.runRefresh();
    }, Math.max(0, dueAt - Date.now()));
  }

  /** 다시 읽을 경로를 줄인다: 덮이는 경로 제거, 안 읽은 뿌리는 통째로, 너무 많은 조각은 뿌리로. */
  private takeDirty(): string[] {
    const result = new Set<string>();
    const splices = new Map<string, string[]>();
    for (const path of this.dirty) {
      const root = this.roots.find((candidate) => isAncestorOrSelf(candidate, path));
      if (root === undefined) {
        for (const under of this.roots) if (isAncestorOrSelf(path, under)) result.add(under);
        continue;
      }
      if (path === root || !this.loaded.has(root)) {
        result.add(root);
        continue;
      }
      splices.set(root, [...(splices.get(root) ?? []), path]);
    }
    this.dirty.clear();
    for (const [root, list] of splices) {
      if (result.has(root)) continue;
      for (const path of coarsen(root, list)) result.add(path);
    }
    return [...result];
  }

  private async runRefresh(): Promise<void> {
    if (this.disposed || this.inFlight || this.dirty.size === 0) return;
    const paths = this.takeDirty();
    if (paths.length === 0) return;
    const seq = this.nextSeq;
    this.nextSeq += 1;
    this.inFlight = new Set(paths);
    let results: Record<string, unknown> | null = null;
    let failure: Extract<RpcOutcome<unknown>, { ok: false }> | null = null;
    try {
      const outcome = paths.length === 1
        ? await this.transport.get(paths[0]).then((single): RpcOutcome<Record<string, unknown> | null> =>
          single.ok ? { ok: true, data: { [paths[0]]: single.data } } : single)
        : await this.transport.getMany(paths);
      if (outcome.ok) results = outcome.data ?? {};
      // 함수 자체가 거부되면(로그아웃 등) 모든 경로가 거부된 것이다 — Firebase 처럼 구독을 cancel 한다.
      else if (outcome.kind === "denied") results = Object.fromEntries(paths.map((path) => [path, { [DENIED_MARKER]: true }]));
      else failure = outcome;
    } catch (error) {
      failure = { ok: false, kind: "error", message: error instanceof Error ? error.message : String(error), code: "" };
    } finally {
      this.inFlight = null;
    }
    if (this.disposed) return;
    if (failure) {
      this.handleRefreshFailure(paths, failure);
      this.drain();
      return;
    }
    this.refreshFailures = 0;
    this.setNetworkOffline(false);
    const touched: string[] = [...paths];
    for (const path of paths) {
      const value = results ? results[path] : null;
      if (isDenied(value)) this.handleDenied(path);
      else this.applyServerData(path, value ?? null);
    }
    this.completedSeq = seq;
    const confirmed = this.overlays.filter((overlay) => overlay.state === "acked" && overlay.confirmSeq <= seq);
    if (confirmed.length > 0) {
      this.overlays = this.overlays.filter((overlay) => !confirmed.includes(overlay));
      for (const overlay of confirmed) touched.push(...overlay.entries.map(([path]) => path));
    }
    this.recomputeOverlapping(touched);
    this.drain();
    this.scheduleRefresh(this.refreshDelayMs);
  }

  private handleRefreshFailure(paths: string[], failure: Extract<RpcOutcome<unknown>, { ok: false }>): void {
    if (failure.kind === "network") this.setNetworkOffline(true);
    // 처음 읽기가 서버 오류(함수 없음 등)로 실패하면 구독을 오류로 끝낸다 — 화면이 무한히 기다리지 않게.
    if (failure.kind === "error" || failure.kind === "invalid") {
      const error = rtdbError("UNKNOWN_ERROR", failure.message || "listen failed");
      const unloaded = paths.filter((path) => this.roots.includes(path) && !this.loaded.has(path));
      for (const path of unloaded) {
        for (const view of [...this.views.values()]) {
          if (!isInfoPath(view.path) && isAncestorOrSelf(path, view.path)) this.cancelView(view, error);
        }
      }
      if (unloaded.length > 0) this.updateRoots();
      paths = paths.filter((path) => !unloaded.includes(path));
    }
    for (const path of paths) this.dirty.add(path);
    if (this.dirty.size === 0) return;
    const attempt = this.refreshFailures;
    this.refreshFailures += 1;
    void this.waitBeforeRetry(attempt).then(() => this.scheduleRefresh(0));
  }

  private applyServerData(path: string, value: unknown): void {
    const node = normalize(value);
    for (const root of this.roots) {
      if (isAncestorOrSelf(root, path)) {
        if (path !== root && !this.loaded.has(root)) return;
        this.serverRoot = setChild(this.serverRoot, path, reconcile(getChild(this.serverRoot, path), node));
        if (path === root) this.markLoaded(root);
        return;
      }
      if (isAncestorOrSelf(path, root)) {
        const sub = getChild(node, relativePath(path, root));
        this.serverRoot = setChild(this.serverRoot, root, reconcile(getChild(this.serverRoot, root), sub));
        this.markLoaded(root);
      }
    }
  }

  private markLoaded(root: string): void {
    this.loaded.add(root);
    for (const mark of [...this.loaded]) if (mark !== root && isAncestorOrSelf(root, mark)) this.loaded.delete(mark);
  }

  /** 읽기가 거부됐다: 그 위치를 덮는 구독은 Firebase 처럼 cancel 하고, 나머지는 각자 다시 읽는다. */
  private handleDenied(path: string): void {
    for (const view of [...this.views.values()]) {
      if (!isInfoPath(view.path) && isAncestorOrSelf(view.path, path)) this.cancelView(view, listenDeniedError(view.path));
    }
    for (const mark of [...this.loaded]) {
      if (pathsOverlap(mark, path)) {
        this.loaded.delete(mark);
        this.pruneMark(mark, false);
      }
    }
    this.updateRoots();
  }

  // ── Realtime 변경 알림 ───────────────────────────────────

  private onRealtimeChange(row: unknown): void {
    if (this.disposed || !row || typeof row !== "object") return;
    const record = row as { id?: unknown; paths?: unknown };
    const id = Number(record.id);
    if (Number.isFinite(id)) {
      if (this.ackedChanges.delete(id)) return;
      this.remember(this.notified, id, this.nextSeq);
    }
    if (Array.isArray(record.paths)) {
      for (const raw of record.paths) if (typeof raw === "string") this.markChanged(normalizePath(raw));
    } else {
      for (const root of this.roots) this.dirty.add(root);
    }
    this.scheduleRefresh(this.refreshDelayMs);
  }

  private remember(map: Map<number, number>, id: number, seq: number): void {
    map.set(id, seq);
    if (map.size > MAX_REMEMBERED_CHANGES) map.delete(map.keys().next().value as number);
  }

  // ── 쓰기 ─────────────────────────────────────────────────

  private applyOverlay(entries: Array<[string, unknown]>): Overlay {
    const now = this.now();
    const resolved = entries.map(([path, value]) => [path, resolveLocally(value, this.visible(path), now)] as [string, Node]);
    const overlay: Overlay = { entries: resolved, state: "pending", confirmSeq: Infinity };
    this.overlays.push(overlay);
    this.recomputeOverlapping(resolved.map(([path]) => path));
    return overlay;
  }

  private dropOverlay(overlay: Overlay): void {
    const index = this.overlays.indexOf(overlay);
    if (index < 0) return;
    this.overlays.splice(index, 1);
    this.recomputeOverlapping(overlay.entries.map(([path]) => path));
  }

  /** 서버가 쓰기를 받아들였다. 다음 새로고침이 그 값을 가져올 때까지 로컬 값을 유지한다(깜빡임 방지). */
  private acknowledge(overlay: Overlay, changeId: number | null): void {
    overlay.state = "acked";
    const paths = overlay.entries.map(([path]) => path);
    if (!this.roots.some((root) => paths.some((path) => pathsOverlap(root, path)))) {
      this.dropOverlay(overlay);
      return;
    }
    if (changeId !== null && this.notified.has(changeId)) {
      overlay.confirmSeq = this.notified.get(changeId)!;
      this.notified.delete(changeId);
      if (overlay.confirmSeq <= this.completedSeq) this.dropOverlay(overlay);
      return;
    }
    if (changeId !== null) {
      this.ackedChanges.add(changeId);
      if (this.ackedChanges.size > MAX_REMEMBERED_CHANGES) this.ackedChanges.delete(this.ackedChanges.values().next().value as number);
    }
    for (const path of paths) this.markChanged(path);
    overlay.confirmSeq = this.nextSeq;
    this.scheduleRefresh(this.refreshDelayMs);
  }

  private enqueue(item: QueueItem): void {
    this.queue.push(item);
    void this.pump();
  }

  /** 쓰기·트랜잭션을 들어온 순서대로 하나씩 보낸다(Firebase 쓰기 순서 보장). */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0 && !this.disposed) {
        try {
          await this.queue[0].run();
        } catch (error) {
          console.error("[rtdb] 쓰기 대기열 처리 중 예외", error);
        }
        this.queue.shift();
      }
    } finally {
      this.pumping = false;
    }
  }

  /** 끊김이면 연결될 때까지(재시도 간격·online·Realtime 재연결) 기다렸다 다시 보낸다. */
  private async untilDelivered<T>(send: () => Promise<RpcOutcome<T>>): Promise<RpcOutcome<T>> {
    for (let attempt = 0; ; attempt += 1) {
      const outcome = await send();
      if (outcome.ok || outcome.kind !== "network" || this.disposed) {
        if (outcome.ok) this.setNetworkOffline(false);
        return outcome;
      }
      this.setNetworkOffline(true);
      await this.waitBeforeRetry(attempt);
    }
  }

  /** set/update/remove 공통. entries 는 루트 기준 [경로, 값]. */
  write(entries: Array<[string, unknown]>): Promise<void> {
    if (entries.length === 0) return Promise.resolve();
    this.start();
    const overlay = this.applyOverlay(entries);
    this.drain();
    const patch: Record<string, unknown> = {};
    for (const [path, value] of entries) patch[path] = toServerJson(value);
    return new Promise<void>((resolve, reject) => {
      this.enqueue({
        run: async () => {
          const outcome = await this.untilDelivered(() => this.transport.update(patch));
          if (outcome.ok) {
            const change = outcome.data?.change;
            const changeId = change === null || change === undefined ? null : Number(change);
            this.acknowledge(overlay, Number.isFinite(changeId) ? changeId : null);
            this.drain();
            resolve();
            return;
          }
          this.dropOverlay(overlay);
          this.drain();
          reject(outcome.kind === "denied" || outcome.kind === "invalid"
            ? writeDeniedError(outcome.message)
            : rtdbError("UNKNOWN_ERROR", outcome.message || "write failed"));
        },
      });
    });
  }

  runTransaction(path: string, updateFn: (current: unknown) => unknown, applyLocally: boolean): Promise<TransactionResult> {
    this.start();
    const reference = new ReferenceImpl(this, path);
    return new Promise<TransactionResult>((resolve, reject) => {
      this.enqueue({
        run: async () => {
          let overlay: Overlay | null = null;
          const fail = (error: Error) => {
            if (overlay) this.dropOverlay(overlay);
            this.drain();
            reject(error);
          };
          try {
            let state = await this.untilDelivered(() => this.transport.getHashed(path));
            for (let tries = 0; ; tries += 1) {
              if (!state.ok) {
                fail(state.kind === "denied" || state.kind === "invalid"
                  ? transactionError("permission_denied", state.message)
                  : rtdbError("UNKNOWN_ERROR", state.message || "transaction failed"));
                return;
              }
              if (tries >= MAX_TRANSACTION_TRIES) {
                fail(transactionError("maxretry"));
                return;
              }
              const current = normalize(state.data?.value ?? null);
              const next = updateFn(nodeToValue(current, false));
              if (next === undefined) {
                if (overlay) this.dropOverlay(overlay);
                this.drain();
                resolve(new TransactionResult(false, new DataSnapshot(current, reference)));
                return;
              }
              validateData("runTransaction", next);
              if (applyLocally) overlay = this.replaceOverlay(overlay, path, next);
              this.drain();
              const hash = state.data?.hash ?? "";
              const cas = await this.untilDelivered(() => this.transport.cas(path, hash, toServerJson(next)));
              if (!cas.ok) {
                state = cas;
                continue;
              }
              if (cas.data?.committed) {
                const committed = normalize(cas.data.value);
                if (overlay) {
                  overlay.entries = [[path, committed]];
                  this.recomputeOverlapping([path]);
                  this.acknowledge(overlay, null);
                } else {
                  this.markChanged(path);
                  this.scheduleRefresh(this.refreshDelayMs);
                }
                this.drain();
                resolve(new TransactionResult(true, new DataSnapshot(committed, reference)));
                return;
              }
              state = { ok: true, data: { value: cas.data?.value ?? null, hash: cas.data?.hash ?? "" } };
            }
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        },
      });
    });
  }

  private replaceOverlay(overlay: Overlay | null, path: string, value: unknown): Overlay {
    if (!overlay) return this.applyOverlay([[path, value]]);
    overlay.entries = [[path, resolveLocally(value, this.visible(path), this.now())]];
    this.recomputeOverlapping([path]);
    return overlay;
  }

  // ── 시험용 들여다보기 ─────────────────────────────────────

  /** @internal 시험: 기다리는 쓰기 수. */
  get _pendingWrites(): number {
    return this.queue.length;
  }

  /** @internal 시험: 현재 뿌리 목록. */
  get _roots(): string[] {
    return [...this.roots];
  }
}
