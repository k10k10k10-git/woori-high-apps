import type { TeacherAttendance } from "./types";
import { resolveTeacherGender } from "./teacherGender";

export const TEACHER_SORT_KEYS = [
  "name",
  "source",
  "bu",
  "gender",
  "classKey",
  "attendance",
  "schedule",
  "note",
] as const;

export type TeacherSortKey = typeof TEACHER_SORT_KEYS[number];
export type TeacherSortDirection = "asc" | "desc";

const koCollator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

export function getTeacherSourceLabel(teacher: Pick<TeacherAttendance, "source">) {
  if (teacher.source === "attendance-db") return "출석부";
  if (teacher.source === "manual-assistant") return "보조스탭";
  return "수동";
}

export function getVisibleTeacherAttendanceLabel(
  teacher: Pick<TeacherAttendance, "bu" | "status" | "corps">,
) {
  if (teacher.bu === "스탭") {
    if (teacher.status === "불참") return "불참";
    return teacher.corps || "본대";
  }
  return teacher.status;
}

function getTeacherSortValue(teacher: TeacherAttendance, key: TeacherSortKey): string {
  switch (key) {
    case "name": return teacher.name;
    case "source": return getTeacherSourceLabel(teacher);
    case "bu": return teacher.bu;
    case "gender": return resolveTeacherGender(teacher) ?? "";
    case "classKey": return teacher.classKey;
    case "attendance": return getVisibleTeacherAttendanceLabel(teacher);
    case "schedule": return [teacher.arrivalInfo, teacher.lateArrival, teacher.transport].filter(Boolean).join(" ");
    case "note": return teacher.note || "";
  }
}

/** 빈 값은 방향과 관계없이 마지막, 같은 값은 이름→ID 순으로 안정적으로 정렬한다. */
export function sortTeachersForTable(
  teachers: TeacherAttendance[],
  key: TeacherSortKey,
  direction: TeacherSortDirection,
): TeacherAttendance[] {
  return [...teachers].sort((a, b) => {
    const aValue = getTeacherSortValue(a, key).trim();
    const bValue = getTeacherSortValue(b, key).trim();
    if (!aValue && bValue) return 1;
    if (aValue && !bValue) return -1;

    const primary = koCollator.compare(aValue, bValue);
    if (primary !== 0) return direction === "asc" ? primary : -primary;

    return koCollator.compare(a.name, b.name) || koCollator.compare(a.id, b.id);
  });
}
