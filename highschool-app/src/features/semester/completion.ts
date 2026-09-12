// 수료 판정 순수 로직 — 학기 출석은 출석 2점 / 지각 1점 / 결석 0점으로 계산한다.
// 수료 여부는 DB에 저장하지 않고 항상 이 함수로 계산한다(이중 원장 방지).

import {
  AttendanceByScope,
  AttendanceStatus,
  SemesterAttendanceScope,
  Session,
  SessionAttendance,
} from "./types";

export const SCORE: Record<AttendanceStatus, number> = {
  출석: 2,
  지각: 1,
  결석: 0,
};

export type EditableAttendanceStatus = AttendanceStatus;

/** 학기 사역팀·훈련 출석 상태. 학생 주일 출석부의 두 상태 정책과 구분한다. */
export const EDITABLE_ATTENDANCE_STATUSES = ["출석", "지각", "결석"] as const satisfies readonly EditableAttendanceStatus[];

/** 저장된 학기 출결 상태를 그대로 표시하고 계산한다. */
export function normalizeAttendanceStatus(status: AttendanceStatus): EditableAttendanceStatus {
  return status;
}

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
    if (entry) score += SCORE[normalizeAttendanceStatus(entry.s)];
    // 미기록과 결석은 모두 0점이지만 원장 상태와 화면 표시는 서로 구분한다.
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

/** 사역팀·훈련은 같은 신청자를 공유해도 서로 다른 출석 원장으로 판정한다. */
export function calcScopedCompletions(
  appKey: string,
  sessions: Session[],
  attendanceByScope: AttendanceByScope,
  minRate: number,
  eligible: Record<SemesterAttendanceScope, boolean>,
): Record<SemesterAttendanceScope, CompletionResult | null> {
  return {
    team: eligible.team
      ? calcCompletion(appKey, sessions, attendanceByScope.team, minRate)
      : null,
    training: eligible.training
      ? calcCompletion(appKey, sessions, attendanceByScope.training, minRate)
      : null,
  };
}
