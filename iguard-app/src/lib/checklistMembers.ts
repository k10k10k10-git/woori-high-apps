import { isTeacherBusPassenger, resolveTeacherAttendance } from "./busParticipation";
import type { Group, PartialAttendanceInfo, TeacherAttendance } from "./types";

/** 조별·호차별 명단에서 학생의 부분참 유형을 짧고 일관되게 표시한다. */
export function studentPartialLabel(info?: PartialAttendanceInfo): string {
  if (!info) return "";
  if (info.type === "당일참석") return `당일참석(${info.day ?? "?"}일차)`;
  return info.type;
}

/** 이름만 저장된 조 교사를 참석 레코드와 대조해 인쇄용 상태를 붙인다. */
export function teacherChecklistMeta(
  teachers: TeacherAttendance[],
  name: string,
  bu: string,
): string {
  const teacher = resolveTeacherAttendance(teachers, name, bu);
  return teacher?.status === "부분참" ? "교사 · 부분참" : "교사";
}

/**
 * 조별 점호에는 불참 교사를 제외하고 이동수단과 관계없이 참석 교사를 포함한다.
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
    : (group.teachers || []).filter(name => {
        const teacher = resolveTeacherAttendance(teachers, name, group.bu);
        // 과거 수동 명단처럼 행정 레코드와 매칭되지 않는 이름은 보존한다.
        return !teacher || teacher.status !== "불참";
      });

  return Array.from(new Set(teacherNames.map(name => name.trim()).filter(Boolean)));
}
