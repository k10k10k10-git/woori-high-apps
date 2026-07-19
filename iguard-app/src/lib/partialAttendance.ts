import type { PartialAttendanceMap } from "./types";

/** isPresentOnDay가 받는 최소 형태 — 타입 문자열 또는 {type, day?} 레코드 */
export type PartialLike = MemberClass | { type: MemberClass; day?: number };

// ════════════════════════════════════════════════════════════
// 부분참(본대/선복귀/후발대/당일참석) 일자별 참석 공식 — 행정·이가드 공유 계약.
// 분류는 행정 소유 노드 retreats/{id}/partialAttendances 에 저장되고,
// 이가드는 읽기 전용으로 소비한다. (선발대는 학생에 없음 → 제외)
//   1일차 출발  = 본대 + 선복귀      (후발대 제외)
//   3일차 복귀  = 본대 + 후발대 − 선복귀
//   당일참석    = 기록된 day 일차에만 현장에 있음 (day=2면 1·3일차 모두 아님)
// 분류값이 없으면(기본) = 본대 → 1·3일차 모두 참석.
// ════════════════════════════════════════════════════════════

export type MemberClass = "선복귀" | "후발대" | "당일참석";
export type RetreatDay = 1 | 2 | 3;

/** 하위호환: 타입 문자열만 넘겨도 되고(기존 호출), 당일참석 일차 판정이 필요하면 record를 넘긴다. */
export function isPresentOnDay(cls: PartialLike | undefined, day: RetreatDay): boolean {
  if (!cls) return true;            // 본대(기본): 둘 다 참석
  const type = typeof cls === "string" ? cls : cls.type;
  if (type === "당일참석") {
    const d = typeof cls === "string" ? undefined : cls.day;
    return d === day;               // 기록된 일차에만 현장에 있음 (일차 미기록이면 불참 취급)
  }
  if (day === 2) return true;       // 선복귀·후발대 모두 수련회 중간 일차에는 현장 참석
  return day === 1 ? type !== "후발대" : type !== "선복귀";
}

/** Firebase의 현재 객체형과 과거 문자열형 부분참 데이터를 같은 형태로 정규화한다. */
export function normalizePartialAttendanceMap(raw: unknown): PartialAttendanceMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PartialAttendanceMap = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const record = typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as { type?: unknown; day?: unknown; note?: unknown; updatedAt?: unknown }
      : null;
    const type = typeof value === "string" ? value : record?.type;
    if (type !== "선복귀" && type !== "후발대" && type !== "당일참석") return;
    out[key] = {
      type,
      ...(type === "당일참석" && typeof record?.day === "number" ? { day: record.day } : {}),
      ...(typeof record?.note === "string" && record.note.trim() ? { note: record.note } : {}),
      ...(typeof record?.updatedAt === "number" ? { updatedAt: record.updatedAt } : {}),
    };
  });
  return out;
}
