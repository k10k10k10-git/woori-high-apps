import { parseClassKey } from "./classKey";
import type { Cancellation } from "./types";

export interface CancellationRosterStudent {
  key: string;
  name: string;
  bu: "1부" | "2부";
  grade: number;
  class: number;
}

export function buildCancellationRosterStudents(
  classesRaw: Record<string, { students?: Record<string, { name?: string }> }>,
): CancellationRosterStudent[] {
  const result: CancellationRosterStudent[] = [];
  Object.entries(classesRaw).forEach(([classKey, classData]) => {
    const parsed = parseClassKey(classKey);
    if (!parsed) return;
    Object.entries(classData.students || {}).forEach(([studentId, student]) => {
      const name = student.name?.trim();
      if (!name) return;
      result.push({
        key: `${parsed.buNum}_${studentId}`,
        name,
        bu: parsed.buNum === 1 ? "1부" : "2부",
        grade: parsed.grade,
        class: parsed.classNum,
      });
    });
  });
  return result;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** 기존 수동 취소 레코드를 부·학년·반·이름이 유일하게 같은 출석부 학생 키로 연결한다. */
export function resolveCancellationStudentKey(
  cancellation: Pick<Cancellation, "studentKey" | "name" | "bu" | "grade" | "class">,
  roster: CancellationRosterStudent[],
): string | null {
  const storedKey = cancellation.studentKey?.trim();
  const name = normalizeName(cancellation.name);
  const matchesCancellation = (student: CancellationRosterStudent) =>
    student.bu === cancellation.bu
    && student.grade === Number(cancellation.grade)
    && student.class === Number(cancellation.class)
    && normalizeName(student.name) === name;
  if (storedKey) {
    const storedStudent = roster.find(student => student.key === storedKey);
    // 출석부 밖 수동 학생 키는 그대로 보존한다. 출석부 학생을 다른 사람으로 수정했다면 재탐색한다.
    if (!storedStudent || matchesCancellation(storedStudent)) return storedKey;
  }
  const matches = roster.filter(matchesCancellation);
  return matches.length === 1 ? matches[0].key : null;
}
