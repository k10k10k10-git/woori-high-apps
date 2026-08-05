import type { Cancellation, TeacherAttendance } from "./types";
import { normalizeName } from "./studentMatcher";

export interface InsuranceStudentEntry {
  name: string;
  bu: string;
  grade: number;
  cls: number;
  idNumber: string;
}

function studentIdentity(name: string, bu: string, grade: number, classNumber: number) {
  return [bu.trim(), Number(grade), Number(classNumber), normalizeName(name)].join("|");
}

/** 취소 명단과 부·학년·반·이름이 모두 같은 학생만 보험 명단에서 제외한다. */
export function excludeCancelledInsuranceStudents(
  entries: InsuranceStudentEntry[],
  cancellations: Pick<Cancellation, "name" | "bu" | "grade" | "class">[],
): InsuranceStudentEntry[] {
  const cancelled = new Set(
    cancellations.map(record => studentIdentity(record.name, record.bu, record.grade, record.class)),
  );
  return entries.filter(entry => !cancelled.has(studentIdentity(entry.name, entry.bu, entry.grade, entry.cls)));
}

/** 교사 참석에서 불참으로 확정된 인원은 보험 입력·출력 대상에서 제외한다. */
export function excludeAbsentInsuranceTeachers<T extends Pick<TeacherAttendance, "status">>(teachers: T[]): T[] {
  return teachers.filter(teacher => teacher.status !== "불참");
}
