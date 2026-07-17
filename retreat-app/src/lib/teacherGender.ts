import type { TeacherAttendance } from "./types";

export type TeacherGender = "남" | "여";

function normalizeGender(value?: string): TeacherGender | null {
  const text = (value ?? "").trim();
  if (text.startsWith("남")) return "남";
  if (text.startsWith("여")) return "여";
  return null;
}

/** 교사 성별은 담당 학생 반과 무관하므로 명시값만 사용한다. */
export function resolveTeacherGender(
  teacher: Pick<TeacherAttendance, "gender" | "originKey" | "classKey">,
): TeacherGender | null {
  return normalizeGender(teacher.gender);
}
