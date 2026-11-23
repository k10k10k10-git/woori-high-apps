import type { Semester, SemesterMeta, Session } from "./types";

/** 정규 학기 번호로 비교한다. 연중 주일 운영 노드는 다음 학기가 아니다. */
export function isLatestRegularSemester(semesterId: string, ids: readonly string[]): boolean {
  const regular = /^\d{4}-[12]$/;
  return regular.test(semesterId) && ids.includes(semesterId) && !ids.some((id) => regular.test(id) && id > semesterId);
}

/** 입력한 기간을 우선하고, 미입력 학기는 실제 등록 회차의 범위를 표시용으로만 사용한다. */
export function semesterSummaryMeta(meta: SemesterMeta, sessions: Record<string, Session> = {}): SemesterMeta {
  const dates = Object.values(sessions).flatMap((session) => [session.date, session.endDate ?? session.date]).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  if (!dates.length) return meta;
  return { ...meta, startDate: meta.startDate || dates[0], endDate: meta.endDate || dates.at(-1) };
}

export type TermPhase = "current" | "upcoming" | "past" | "unscheduled";

export function featuredTerm(semesters: Semester[], today: string): { semester: Semester; phase: TermPhase } | null {
  const current = semesters.find(({ meta }) => !!meta.startDate && !!meta.endDate && meta.startDate <= today && today <= meta.endDate);
  if (current) return { semester: current, phase: "current" };
  const upcoming = semesters.filter(({ meta }) => !!meta.startDate && meta.startDate > today)
    .sort((a, b) => a.meta.startDate!.localeCompare(b.meta.startDate!))[0];
  if (upcoming) return { semester: upcoming, phase: "upcoming" };
  const past = semesters.filter(({ meta }) => !!meta.endDate && meta.endDate < today)
    .sort((a, b) => b.meta.endDate!.localeCompare(a.meta.endDate!))[0];
  if (past) return { semester: past, phase: "past" };
  return semesters[0] ? { semester: semesters[0], phase: "unscheduled" } : null;
}

export const TERM_PHASE_LABEL: Record<TermPhase, string> = {
  current: "현재 학기", upcoming: "예정 학기", past: "지난 학기", unscheduled: "등록된 학기",
};
