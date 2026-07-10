// 수료 판정 순수 로직 — 시트의 "출석 2 / 지각 1 / 결석 0" 규칙을 그대로 계승.
// 수료 여부는 DB에 저장하지 않고 항상 이 함수로 계산한다(이중 원장 방지).

import { AttendanceStatus, Session, SessionAttendance } from "./types";

export const SCORE: Record<AttendanceStatus, number> = {
  출석: 2,
  지각: 1,
  결석: 0,
};

export interface CompletionResult {
  score: number; // 획득 점수
  maxScore: number; // 만점 (정규 회차 수 × 2)
  rate: number; // 0~1 (만점 0이면 0)
  completed: boolean; // rate >= minRate
  regularSessionCount: number;
}

/** 정규 회차만 집계 대상 (휴강·행사는 만점에서 제외) */
export function regularSessions(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.type === "정규");
}

export function calcCompletion(
  appKey: string,
  sessions: Session[],
  attendanceBySession: Record<string, SessionAttendance>, // sessionId → (appKey → entry)
  minRate: number,
): CompletionResult {
  const regs = regularSessions(sessions);
  const maxScore = regs.length * SCORE.출석;
  let score = 0;
  for (const sess of regs) {
    const entry = attendanceBySession[sess.id]?.[appKey];
    if (entry) score += SCORE[entry.s] ?? 0;
    // 미기록 = 0점 (시트의 "결석 미표시"와 동일 취급)
  }
  const rate = maxScore > 0 ? score / maxScore : 0;
  return {
    score,
    maxScore,
    rate,
    completed: maxScore > 0 && rate >= minRate,
    regularSessionCount: regs.length,
  };
}
