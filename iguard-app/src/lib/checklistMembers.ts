import { isTeacherBusPassenger } from "./busParticipation";
import type { Group, TeacherAttendance } from "./types";

function parseNames(value?: string): string[] {
  return (value || "").split(",").map(name => name.trim()).filter(Boolean);
}

/**
 * 조별 점호에는 이동수단과 관계없이 조 교사를 모두 포함한다.
 * 호차별 점호에서만 불참·자차 교사를 단체버스 명단에서 제외한다.
 * 조장은 학생 역할이므로 두 경우 모두 포함한다.
 */
export function roleNamesForChecklist(
  group: Group,
  teachers: TeacherAttendance[],
  mode: "group" | "bus",
): string[] {
  const teacherNames = mode === "bus"
    ? (group.teachers || []).filter(name => isTeacherBusPassenger(teachers, name, group.bu))
    : (group.teachers || []);

  return Array.from(new Set([
    ...teacherNames,
    ...parseNames(group.leader),
  ].map(name => name.trim()).filter(Boolean)));
}
