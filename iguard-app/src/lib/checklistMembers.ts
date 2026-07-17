import { isTeacherBusPassenger } from "./busParticipation";
import type { Group, TeacherAttendance } from "./types";

/**
 * 조별 점호에는 이동수단과 관계없이 조 교사를 모두 포함한다.
 * 호차별 점호에서만 불참·자차 교사를 단체버스 명단에서 제외한다.
 * 조장은 group.studentIds에 이미 포함된 학생 역할이므로 교사 명단에 중복 추가하지 않는다.
 */
export function roleNamesForChecklist(
  group: Group,
  teachers: TeacherAttendance[],
  mode: "group" | "bus",
): string[] {
  const teacherNames = mode === "bus"
    ? (group.teachers || []).filter(name => isTeacherBusPassenger(teachers, name, group.bu))
    : (group.teachers || []);

  return Array.from(new Set(teacherNames.map(name => name.trim()).filter(Boolean)));
}
