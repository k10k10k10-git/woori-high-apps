/**
 * 홈 "전체 일정"의 학기 항목 계산.
 *
 * 정규 회차를 1주 단위로 줄줄이 나열하면 홈 일정이 학기 모임으로만 가득 찬다.
 * 정규 회차는 "한 학기 사역팀 모임 전체 기간" 한 줄로 합치고,
 * 휴강·행사처럼 개별 의미가 있는 회차만 따로 남긴다.
 */

import type { Session } from "@/features/semester/types";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";

export type SemesterTimelineEntry = {
  key: string;
  date: string;
  endDate?: string;
  title: string;
};

export const SEMESTER_REGULAR_TITLE = "한 학기 사역팀 모임 전체 기간";

export function buildSemesterTimeline(sessions: Session[]): SemesterTimelineEntry[] {
  const regularDates = sessions
    .filter((session) => session.type === "정규")
    .flatMap((session) => [session.date, session.endDate].filter((date): date is string => !!date))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const entries: SemesterTimelineEntry[] = [];
  if (regularDates.length > 0) {
    const start = regularDates[0];
    const end = regularDates[regularDates.length - 1];
    entries.push({
      key: "semester-regular",
      date: start,
      ...(end !== start ? { endDate: end } : {}),
      title: SEMESTER_REGULAR_TITLE,
    });
  }

  for (const session of sessions) {
    if (session.type === "정규") continue;
    entries.push({
      key: `semester-${session.id}`,
      date: session.date,
      ...(session.endDate ? { endDate: session.endDate } : {}),
      title: sessionDisplayLabel(session),
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
