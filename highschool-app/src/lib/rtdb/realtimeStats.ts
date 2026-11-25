// 실시간 알림을 옮기는 동안의 확인용 건수(경로·값·이름 없음). 브라우저 개발자 도구에서 `__rtdbRealtimeStats` 로 본다.
// received: 그 길로 받은 알림 수, first: 그 길로 처음 받은 변경 번호, status: 마지막 연결 상태, duplicates: 두 길로 겹쳐 온 수.
export type RealtimeKind = "changes" | "broadcast";
type PathStats = { status: string; received: number; first: number | null };
export type RealtimeStats = { changes: PathStats; broadcast: PathStats; duplicates: number };

export function createRealtimeStats(): RealtimeStats {
  const stats: RealtimeStats = {
    changes: { status: "", received: 0, first: null },
    broadcast: { status: "", received: 0, first: null },
    duplicates: 0,
  };
  if (typeof window !== "undefined") (window as unknown as { __rtdbRealtimeStats?: unknown }).__rtdbRealtimeStats = stats;
  return stats;
}

/** 알림 한 건을 센다(처리 전에 부른다 — seen 은 이미 처리한 번호). broadcast 를 처음 받으면 콘솔에 번호만 한 줄. */
export function countRealtime(stats: RealtimeStats, kind: RealtimeKind, row: unknown, seen: Set<number>): void {
  const path = stats[kind];
  path.received += 1;
  const id = Number((row as { id?: unknown } | null | undefined)?.id);
  if (!Number.isFinite(id)) return;
  if (seen.has(id)) stats.duplicates += 1;
  if (path.first !== null) return;
  path.first = id;
  if (kind === "broadcast" && typeof window !== "undefined") console.info(`[rtdb] broadcast 알림을 받기 시작했습니다(변경 번호 ${id}).`);
}

/** 연결 상태가 바뀌면 콘솔에 한 줄(채널 이름과 상태만). */
export function noteRealtimeStatus(stats: RealtimeStats, kind: RealtimeKind, status: string): void {
  if (stats[kind].status !== status && typeof window !== "undefined") {
    console.info(`[rtdb] 실시간 ${kind === "broadcast" ? "broadcast" : "postgres_changes"} 채널: ${status}`);
  }
  stats[kind].status = status;
}
