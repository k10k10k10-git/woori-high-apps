import type { Session } from "./types";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

type SessionDateRange = Pick<Session, "date" | "endDate">;

/** 저장 전 날짜 범위 오류. 종료일이 없거나 시작일과 같으면 단일 날짜 회차다. */
export function sessionDateRangeError(date: string, endDate?: string): string | null {
  if (!YMD.test(date)) return "시작일은 YYYY-MM-DD 형식이어야 합니다";
  if (!endDate) return null;
  if (!YMD.test(endDate)) return "종료일은 YYYY-MM-DD 형식이어야 합니다";
  if (endDate < date) return "종료일은 시작일보다 빠를 수 없습니다";
  return null;
}

/** 같은 날을 종료일로 중복 저장하지 않는다. */
export function normalizedSessionEndDate(date: string, endDate?: string): string | undefined {
  return endDate && endDate !== date ? endDate : undefined;
}

/** 설정·선택 상자·커리큘럼에서 쓰는 전체 날짜 범위 표기. */
export function sessionDateLabel(session: SessionDateRange): string {
  const endDate = normalizedSessionEndDate(session.date, session.endDate);
  return endDate ? `${session.date} ~ ${endDate}` : session.date;
}

/** 좁은 출석표 머리글용 날짜 표기. 전체 범위는 title/aria-label에도 함께 제공한다. */
export function sessionDayLabel(session: SessionDateRange): string {
  const startDay = String(Number(session.date.slice(8, 10)));
  const endDate = normalizedSessionEndDate(session.date, session.endDate);
  if (!endDate) return startDay;
  return `${startDay}~${Number(endDate.slice(8, 10))}`;
}

/** 오늘 진행 중인 다일 회차도 현재 회차로 고른다. */
export function sessionIncludesDate(session: SessionDateRange, date: string): boolean {
  return session.date <= date && date <= (session.endDate ?? session.date);
}
