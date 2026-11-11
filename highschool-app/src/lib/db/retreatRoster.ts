import { onValue, ref } from "@/lib/rtdb";
import { auth, db } from "@/lib/firebase";
import type { Student } from "@/lib/types";

export type RetreatRosterSnapshot = {
  year: number;
  students: Record<string, Student>;
  classes: Record<string, { teacher?: string; students?: Record<string, Student> }>;
};

/** 수련회 화면은 서버에서 현재 역할을 재검증하고 해당 행사에 필요한 명단만 받는다. */
export async function getRetreatRoster(retreatId: string, year: number, signal?: AbortSignal): Promise<RetreatRosterSnapshot> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인 후 다시 시도해 주세요.");
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었습니다.");
  const response = await fetch(`/api/retreat-students?retreatId=${encodeURIComponent(retreatId)}`, {
    cache: "no-store", signal, headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었습니다.");
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "수련회 명단을 불러오지 못했습니다.");
  if (body?.year !== year) throw new Error("수련회 연도가 바뀌었습니다. 새로고침해 주세요.");
  return { year, students: body.students ?? {}, classes: body.classes ?? {} };
}

export function subscribeRetreatRoster(
  retreatId: string, year: number,
  callback: (roster: RetreatRosterSnapshot) => void,
  onError?: (error: Error) => void,
): () => void {
  let disposed = false;
  let controller: AbortController | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const refresh = async () => {
    if (disposed) return;
    controller?.abort();
    controller = new AbortController();
    const current = controller;
    try {
      const next = await getRetreatRoster(retreatId, year, current.signal);
      if (!disposed && !current.signal.aborted) callback(next);
    } catch (error) {
      if (!disposed && !current.signal.aborted) onError?.(error instanceof Error ? error : new Error("수련회 명단을 불러오지 못했습니다."));
    }
  };
  const scheduleRefresh = () => {
    if (disposed || refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = null; void refresh(); }, 150);
  };
  const unsubs = ["participants", "groups", "rooms", "cellColors", "partialAttendances"]
    .map((field) => onValue(ref(db, `retreats/${retreatId}/${field}`), scheduleRefresh, onError));
  const timer = setInterval(scheduleRefresh, 60_000);
  scheduleRefresh();
  return () => { disposed = true; controller?.abort(); clearInterval(timer); if (refreshTimer) clearTimeout(refreshTimer); unsubs.forEach((unsubscribe) => unsubscribe()); };
}
