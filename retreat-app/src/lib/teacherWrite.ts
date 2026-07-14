import type { TeacherAttendance } from "./types";

const CLEARABLE_TEACHER_FIELDS = [
  "note",
  "arrivalInfo",
  "transport",
  "age",
  "role",
  "corps",
  "lateArrival",
  "programTeam",
  "worship",
] as const;

type ClearableTeacherField = typeof CLEARABLE_TEACHER_FIELDS[number];

export type TeacherUpdate =
  Partial<Omit<TeacherAttendance, "id" | ClearableTeacherField>>
  & { [K in ClearableTeacherField]?: TeacherAttendance[K] | null };

/**
 * 수정 폼이 비운 선택 필드는 Firebase update에서 null 삭제로 전달한다.
 * 키 자체가 없는 부분 업데이트는 건드리지 않아 출석부 재불러오기의 보존 동작을 유지한다.
 */
export function prepareTeacherUpdate(
  data: Partial<Omit<TeacherAttendance, "id">>,
): TeacherUpdate {
  const result: Record<string, unknown> = { ...data };
  for (const key of CLEARABLE_TEACHER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const value = data[key];
    if (value === undefined || value === "") result[key] = null;
  }
  return result as TeacherUpdate;
}
