// 데이터 검증 순수 규칙 — ValidationView에서 분리 (firebase 의존 없음 → 단위 테스트 가능)

import { IguardScheduleBlock } from "./types";

const toMin = (t?: string) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export function overlaps(a: IguardScheduleBlock, b: IguardScheduleBlock): boolean {
  if (a.day !== b.day) return false;
  const s1 = toMin(a.start), e1 = toMin(a.end), s2 = toMin(b.start), e2 = toMin(b.end);
  if (s1 == null || e1 == null || s2 == null || e2 == null) return false;
  return s1 < e2 && s2 < e1;
}

/** 순간이동 판정 — 시간이 겹치는 두 배치가 "서로 다른 포스트"일 때만 모순이다.
 *  같은 포스트면(예: 취침 숙소 층장 + 새벽 간식 숙소 층장) 이동이 없으므로 정상 —
 *  이 검사가 빠져 있어 겹치는 밤 시간대 배정이 전부 오탐(실측 20건)으로 잡혔다(2026-07-12 수정). */
export function isTeleport(
  a: { postId: string; block: IguardScheduleBlock },
  b: { postId: string; block: IguardScheduleBlock },
): boolean {
  return a.postId !== b.postId && overlaps(a.block, b.block);
}
