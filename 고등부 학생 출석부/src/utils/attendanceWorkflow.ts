import type { AttData, EventsMap, MonthEntry, Student } from '@/types';
import { evKey } from './dates';

export type EditableWeek = {
  key: string;
  label: string;
  dateValue: number;
  isCurrentWeek: boolean;
};

function kstDateValue(nowMs: number): number {
  const now = new Date(nowMs + 9 * 60 * 60 * 1000);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** 오늘까지 지난 정상 주일을 최신순으로 돌려준다. 연휴·행사 주일은 편집 후보에서 제외한다. */
export function recentEditableWeeks(
  year: number,
  months: MonthEntry[],
  events: EventsMap,
  nowMs: number,
  limit = 4,
): EditableWeek[] {
  const today = kstDateValue(nowMs);
  const todayKst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const currentSunday = Date.UTC(
    todayKst.getUTCFullYear(),
    todayKst.getUTCMonth(),
    todayKst.getUTCDate() - todayKst.getUTCDay(),
  );
  return months
    .flatMap(({ month, sundays }, mi) => sundays.map((day, di) => ({
      key: evKey(mi, di),
      label: `${month}월 ${day}일`,
      dateValue: Date.UTC(year, month - 1, day),
      isCurrentWeek: Date.UTC(year, month - 1, day) === currentSunday,
    })))
    .filter((week) => week.dateValue <= today && !events[week.key])
    .sort((a, b) => b.dateValue - a.dateValue)
    .slice(0, limit);
}

export function activeAndLongAbsentStudents(students: Student[]): {
  active: Student[];
  longAbsent: Student[];
} {
  return {
    active: students.filter((student) => student.jang !== true),
    longAbsent: students.filter((student) => student.jang === true),
  };
}

export function unenteredStudentIds(
  students: Student[],
  classAttendance: AttData[string] | undefined,
  weekKey: string | undefined,
): string[] {
  if (!weekKey) return [];
  return students
    .filter((student) => !(classAttendance?.[student.id]?.[weekKey]))
    .map((student) => student.id);
}

export function consecutiveAbsentStudentIds(
  students: Student[],
  classAttendance: AttData[string] | undefined,
  weekKeys: string[],
  threshold = 3,
): string[] {
  if (weekKeys.length < threshold) return [];
  const targetWeeks = weekKeys.slice(0, threshold);
  return students
    .filter((student) => targetWeeks.every((weekKey) => classAttendance?.[student.id]?.[weekKey] === 'X'))
    .map((student) => student.id);
}
