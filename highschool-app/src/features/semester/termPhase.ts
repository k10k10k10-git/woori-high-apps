import type { Semester } from "./types";

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
