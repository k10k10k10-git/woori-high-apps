import type { DataSnapshot } from "firebase/database";

// Helper: DataSnapshot → typed list (injects id from Firebase key)
/** RTDB 스냅샷을 `{ id, ...값 }` 배열로. 이 저장소의 유일한 변환 경로다
 *  (CLAUDE.md: `Object.entries(snap.val()).map` 직접 사용 금지).
 *
 *  `exists()`가 true라도 값이 객체라는 보장은 없다 — 문자열 노드(예: retreats/{id}/name)를
 *  실수로 넘기면 `Object.entries("여름")`이 예외 없이 문자 인덱스 객체를 만들어
 *  화면에 쓰레기 행이 조용히 생긴다. 자식이 primitive인 경우도 마찬가지다.
 *  그래서 두 단계(루트 형태 / 자식 형태)를 모두 거른다. 2026-09-02에 이가드 전용
 *  사본에만 있던 이 가드를 공용으로 승격했다(snapToList.test.ts가 지킨다). */
export function snapToList<T extends { id: string }>(snap: DataSnapshot): T[] {
  if (!snap.exists()) return [];
  const raw = snap.val();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw)
    .filter(([, data]) => data != null && typeof data === "object" && !Array.isArray(data))
    .map(([id, data]) => ({ id, ...(data as object) } as T));
}
