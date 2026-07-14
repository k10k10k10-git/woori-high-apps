import { buildPartialPool } from "./partialPool";
import type { Participant, PartialAttendance, Student } from "./types";

export interface MealPartialPerson {
  id: string;
  name: string;
  bu: string;
  grade: number;
  classNum: number;
  note: string;
  type: PartialAttendance["type"];
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
      matched: Boolean(row),
    };
  });
}
