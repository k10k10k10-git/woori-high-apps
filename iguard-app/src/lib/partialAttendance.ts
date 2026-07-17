import type { PartialAttendanceMap } from "./types";

// ════════════════════════════════════════════════════════════
// 부분참(본대/선복귀/후발대) 일자별 참석 공식 — 행정·이가드 공유 계약.
// 분류는 행정 소유 노드 retreats/{id}/partialAttendances 에 저장되고,
// 이가드는 읽기 전용으로 소비한다. (선발대는 학생에 없음 → 제외)
//   1일차 출발  = 본대 + 선복귀      (후발대 제외)
//   3일차 복귀  = 본대 + 후발대 − 선복귀
// 분류값이 없으면(기본) = 본대 → 1·3일차 모두 참석.
// ════════════════════════════════════════════════════════════

export type MemberClass = "선복귀" | "후발대";

export function isPresentOnDay(cls: MemberClass | undefined, day: 1 | 3): boolean {
  if (!cls) return true;            // 본대(기본): 둘 다 참석
  return day === 1 ? cls !== "후발대" : cls !== "선복귀";
}

/** Firebase의 현재 객체형과 과거 문자열형 부분참 데이터를 같은 형태로 정규화한다. */
export function normalizePartialAttendanceMap(raw: unknown): PartialAttendanceMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PartialAttendanceMap = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const record = typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as { type?: unknown; note?: unknown; updatedAt?: unknown }
      : null;
    const type = typeof value === "string" ? value : record?.type;
    if (type !== "선복귀" && type !== "후발대") return;
    out[key] = {
      type,
      ...(typeof record?.note === "string" && record.note.trim() ? { note: record.note } : {}),
      ...(typeof record?.updatedAt === "number" ? { updatedAt: record.updatedAt } : {}),
    };
  });
  return out;
}
