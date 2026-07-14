import type { Group, Student } from "./types";

export type GroupRoleStudent = Student & { bu?: string };

function belongsToBu(student: GroupRoleStudent, bu: string): boolean {
  if (student.bu) return student.bu === bu;
  return student.buNum ? `${student.buNum}부` === bu : false;
}

/**
 * 이름만 저장된 조장/스탭을 학생 ID로 되찾는다.
 * 같은 이름이 여러 부서에 있을 수 있으므로 현재 조 소속 ID → 현재 부서 → 전역 유일 이름 순으로만 확정한다.
 */
export function resolveGroupRoleStudentId<T extends GroupRoleStudent>(
  students: Record<string, T>,
  group: Pick<Group, "bu" | "studentIds">,
  name: string,
): string | undefined {
  const named = Object.entries(students).filter(([, student]) => student.name === name);
  if (named.length === 0) return undefined;

  const groupIds = new Set(group.studentIds || []);
  const inGroup = named.filter(([id]) => groupIds.has(id));
  const inGroupAndBu = inGroup.filter(([, student]) => belongsToBu(student, group.bu));
  if (inGroupAndBu.length === 1) return inGroupAndBu[0][0];
  if (inGroup.length === 1) return inGroup[0][0];

  const inBu = named.filter(([, student]) => belongsToBu(student, group.bu));
  if (inBu.length === 1) return inBu[0][0];
  return named.length === 1 ? named[0][0] : undefined;
}

export function resolveGroupRoleStudent<T extends GroupRoleStudent>(
  students: Record<string, T>,
  group: Pick<Group, "bu" | "studentIds">,
  name: string,
): T | undefined {
  const id = resolveGroupRoleStudentId(students, group, name);
  return id ? students[id] : undefined;
}
