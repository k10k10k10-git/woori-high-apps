import type { TeacherAttendance } from "./types";

/**
 * 이가드 소유 groupStaff의 teacher.id 목록을 인쇄용 이름으로 변환한다.
 * 행정 group.staff와 같은 이름은 화면과 동일하게 한 번만 표시한다.
 */
export function resolveIguardGroupStaffNames(
  groupId: string,
  groupStaff: Record<string, string[]>,
  teachers: TeacherAttendance[],
  excludedNames: Iterable<string> = [],
): string[] {
  const teacherNameById = new Map(teachers.map(teacher => [teacher.id, teacher.name.trim()]));
  const excluded = new Set([...excludedNames].map(name => name.trim()).filter(Boolean));
  const seen = new Set<string>();

  return (groupStaff[groupId] || []).flatMap(teacherId => {
    const name = teacherNameById.get(teacherId)?.trim();
    if (!name || excluded.has(name) || seen.has(name)) return [];
    seen.add(name);
    return [name];
  });
}

export function teacherPrintStatus(
  teachers: TeacherAttendance[], name: string, bu: string,
): TeacherAttendance["status"] | undefined {
  const matches = teachers.filter(teacher => teacher.name === name);
  return matches.find(teacher => teacher.bu === bu)?.status
    ?? matches.find(teacher => teacher.bu === "스탭")?.status
    ?? matches[0]?.status;
}

export function teacherPrintStatusLabel(status?: string): "부분참" | "불참" | "" {
  return status === "부분참" || status === "불참" ? status : "";
}

export function resolvePrintGender(gender: string | undefined, classNumber: number): "남" | "여" {
  const normalized = gender?.trim().charAt(0);
  if (normalized === "남" || normalized === "여") return normalized;
  // 고등부 반 편성의 기존 규칙: 홀수반=남, 짝수반=여
  return classNumber % 2 === 0 ? "여" : "남";
}

export function studentPrintRowClass(
  gender: string | undefined, classNumber: number, cellColor?: string,
): "r-male" | "r-female" | "r-red" {
  if (cellColor === "red") return "r-red";
  return resolvePrintGender(gender, classNumber) === "남" ? "r-male" : "r-female";
}
