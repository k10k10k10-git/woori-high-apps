import { get, onValue, ref } from "@/lib/rtdb";
import { auth, db } from "@/lib/firebase";
import { paths } from "./paths";
import { semesterSummaryMeta } from "./termPhase";
import type { Semester, SemesterMeta, Session } from "./types";

type Listener = { cb: (items: Semester[]) => void; onError?: (error: Error) => void };
type Entry = {
  meta?: SemesterMeta | null;
  sessions?: Record<string, Session>;
  sessionGeneration?: number;
  failed: boolean;
  offMeta: () => void;
  offSessions?: () => void;
};
const stores = new Map<string, ReturnType<typeof createStore>>();

async function fetchIds(uid: string, signal: AbortSignal): Promise<string[]> {
  const user = auth.currentUser;
  if (user?.uid !== uid) throw new Error("로그인 계정이 바뀌었습니다.");
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== uid || signal.aborted) throw new Error("학기 목록 조회가 종료되었습니다.");
  const response = await fetch("/api/semester-ids", {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.ids) || body.ids.some((id: unknown) =>
    typeof id !== "string" || !id || /[.#$\[\]/\u0000-\u001f\u007f]/.test(id))) {
    throw new Error("학기 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (auth.currentUser?.uid !== uid) throw new Error("로그인 계정이 바뀌었습니다.");
  return [...new Set<string>(body.ids)];
}

function createStore(uid: string) {
  const listeners = new Set<Listener>();
  const entries = new Map<string, Entry>();
  let disposed = false, discovered = false, refreshing = false, refreshAgain = false;
  let value: Semester[] | undefined;
  let error: Error | undefined;
  let controller: AbortController | undefined;
  const active = () => !disposed && auth.currentUser?.uid === uid;
  const fail = (reason: Error) => {
    if (!active()) return;
    error = reason;
    value = undefined;
    listeners.forEach((listener) => listener.onError?.(reason));
  };
  const emit = () => {
    if (!active() || !discovered || [...entries.values()].some((entry) =>
      entry.failed || entry.meta === undefined || (entry.meta && !entry.meta.startDate && entry.sessions === undefined)
      || (entry.meta && !entry.meta.endDate && entry.sessions === undefined))) return;
    const next = [...entries].flatMap(([id, entry]) => entry.meta
      ? [{ id, meta: semesterSummaryMeta(entry.meta, entry.sessions) }] : [])
      .sort((a, b) => b.id.localeCompare(a.id));
    if (JSON.stringify(next) === JSON.stringify(value)) return;
    value = next;
    error = undefined;
    listeners.forEach((listener) => listener.cb(next));
  };
  const stopEntry = (entry: Entry) => { entry.offMeta(); entry.offSessions?.(); };
  const attach = (id: string) => {
    const entry: Entry = { failed: false, offMeta: () => {} };
    entries.set(id, entry);
    const current = () => active() && entries.get(id) === entry;
    const onError = (reason: Error) => {
      if (!current()) return;
      entry.failed = true;
      fail(reason);
    };
    entry.offMeta = onValue(ref(db, paths.semesterMeta(id)), (snapshot) => {
      if (!current()) return;
      entry.meta = snapshot.val() as SemesterMeta | null;
      // 기간이 명시된 학기는 회차를 받지 않고, 기존 기간 추정만 보존한다.
      if (entry.meta && (!entry.meta.startDate || !entry.meta.endDate)) {
        if (!entry.offSessions) {
          const generation = entry.sessionGeneration = (entry.sessionGeneration ?? 0) + 1;
          entry.offSessions = onValue(ref(db, paths.sessions(id)), (sessions) => {
            if (!current() || entry.sessionGeneration !== generation) return;
            entry.sessions = sessions.val() ?? {};
            emit();
          }, (reason) => { if (entry.sessionGeneration === generation) onError(reason); });
        }
      } else {
        entry.sessionGeneration = (entry.sessionGeneration ?? 0) + 1;
        entry.offSessions?.();
        entry.offSessions = undefined;
        entry.sessions = undefined;
      }
      emit();
    }, onError);
  };
  const refresh = async () => {
    if (!active()) return;
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15000);
    try {
      const ids = await fetchIds(uid, controller.signal);
      if (!active()) return;
      discovered = false;
      for (const [id, entry] of entries) {
        if (!ids.includes(id) || entry.failed) { entries.delete(id); stopEntry(entry); }
      }
      ids.forEach((id) => { if (!entries.has(id)) attach(id); });
      discovered = true;
      emit();
    } catch (reason) {
      if (active()) { discovered = false; fail(reason instanceof Error ? reason : new Error("학기 목록 조회 실패")); }
    } finally {
      clearTimeout(timeout);
      refreshing = false;
      if (refreshAgain) { refreshAgain = false; void refresh(); }
    }
  };
  const refreshVisible = () => { if (document.visibilityState !== "hidden") void refresh(); };
  const timer = setInterval(refreshVisible, 60000);
  window.addEventListener("focus", refreshVisible);
  window.addEventListener("online", refreshVisible);
  document.addEventListener("visibilitychange", refreshVisible);
  return {
    listeners,
    refresh,
    current: () => ({ value, error }),
    dispose() {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      entries.forEach(stopEntry);
      entries.clear();
    },
  };
}

/** 같은 로그인 화면들이 ID 탐색과 meta 구독을 공유한다. 출석·신청 원장은 구독하지 않는다. */
export function subscribeSemesters(cb: Listener["cb"], onError?: Listener["onError"]): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { onError?.(new Error("로그인 후 학기 목록을 열어 주세요.")); return () => {}; }
  let store = stores.get(uid);
  if (!store) { store = createStore(uid); stores.set(uid, store); }
  const listener = { cb, onError };
  store.listeners.add(listener);
  const current = store.current();
  if (current.error) onError?.(current.error);
  else if (current.value) cb(current.value);
  if (store.listeners.size === 1 || current.error) void store.refresh();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    store.listeners.delete(listener);
    if (!store.listeners.size) { store.dispose(); stores.delete(uid); }
  };
}

/** 생성·삭제 성공 후에는 다음 주기까지 기다리지 않고 목록을 갱신한다. */
export function refreshSemesterList(): void {
  const uid = auth.currentUser?.uid;
  if (uid) void stores.get(uid)?.refresh();
}

export async function getSemesters(): Promise<Semester[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인 후 학기 목록을 열어 주세요.");
  const ids = await fetchIds(uid, AbortSignal.timeout(15000));
  const items = await Promise.all(ids.map(async (id) => {
    const meta = (await get(ref(db, paths.semesterMeta(id)))).val() as SemesterMeta | null;
    if (!meta) return null;
    const sessions = meta.startDate && meta.endDate ? undefined : (await get(ref(db, paths.sessions(id)))).val() ?? {};
    return { id, meta: semesterSummaryMeta(meta, sessions) };
  }));
  if (auth.currentUser?.uid !== uid) throw new Error("로그인 계정이 바뀌었습니다.");
  return items.filter((item): item is Semester => item !== null).sort((a, b) => b.id.localeCompare(a.id));
}
