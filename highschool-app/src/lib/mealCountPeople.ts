import { buildPartialPool } from "./partialPool";
import type { MealSlot, Participant, PartialAttendance, RetreatPeriod, Student } from "./types";

export interface MealPartialPerson {
  id: string;
  name: string;
  bu: string;
  grade: number;
  classNum: number;
  note: string;
  type: PartialAttendance["type"];
  day?: 1 | 2 | 3;  // 당일참석 전용 — 참석 일차
  matched: boolean;
}

/**
 * 식수 계산의 학생 부분참 명단.
 * 참가자에 없는 수동 학생도 부분참 탭과 동일하게 classes 학생 원장으로 보완한다.
 */
export function buildMealPartialPeople(
  participants: Record<string, Participant>,
  students: Record<string, Student>,
  partials: PartialAttendance[],
): MealPartialPerson[] {
  const poolByKey = new Map(
    buildPartialPool(participants, students, {}, partials).map((row) => [row.studentKey, row]),
  );

  return partials.map((partial) => {
    const row = poolByKey.get(partial.id);
    return {
      id: partial.id,
      name: row?.name ?? `(명단 미매칭: ${partial.id})`,
      bu: row?.bu ?? "?",
      grade: row?.grade ?? 0,
      classNum: row?.classNum ?? 0,
      note: partial.note ?? "",
      type: partial.type,
      day: partial.day,
      matched: Boolean(row),
    };
  });
}

/** 수련회 전체 기간의 첫 날짜를 기준으로 N일차의 YYYY-MM-DD를 구한다. */
export function retreatDateForDay(periods: RetreatPeriod[], day: 1 | 2 | 3): string | undefined {
  const startDate = periods
    .map(period => period.startDate)
    .filter(Boolean)
    .sort()[0];
  if (!startDate) return undefined;

  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setDate(date.getDate() + day - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dateOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateOfMonth}`;
}

/** 당일참석 학생은 지정 일차와 날짜가 같은 끼니에만 포함한다. */
export function isMealIncludedForDayAttendance(
  meal: MealSlot,
  periods: RetreatPeriod[],
  day: 1 | 2 | 3,
): boolean {
  const targetDate = retreatDateForDay(periods, day);
  // 기간이 아직 로드되지 않았거나 없을 때는 잘못 차감하지 않는다.
  return !targetDate || meal.date === targetDate;
}
