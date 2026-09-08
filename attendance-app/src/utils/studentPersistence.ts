import type { Student } from '@/types';

export type StudentEditValues = Pick<Student, 'name' | 'birth' | 'phone' | 'pphone' | 'school' | 'addr' | 'photo'>;

const editableFields = ['name', 'birth', 'phone', 'pphone', 'school', 'addr', 'photo'] as const;
const fieldValue = (value: string | undefined) => (value ?? '').trim();

/** 사용자가 수정한 필드만 병합하고, 같은 필드의 원격 수정과 충돌하면 중단한다. */
export function mergeStudentEdit(latest: Student, opened: Student, values: StudentEditValues): Student | undefined {
  const next = { ...latest };
  for (const key of editableFields) {
    const before = fieldValue(opened[key]), desired = fieldValue(values[key]), current = fieldValue(latest[key]);
    if (desired === before) continue;
    if (current !== before && current !== desired) return undefined;
    if (desired || key === 'name') next[key] = desired;
    else delete next[key];
  }
  return next;
}

export function editStudent(existing: Student | undefined, id: string, personId: string, values: StudentEditValues): Student {
  const next = { ...existing, id, personId: existing?.personId || personId, name: values.name.trim() };
  for (const key of ['birth', 'phone', 'pphone', 'school', 'addr', 'photo'] as const) {
    if (values[key]) next[key] = values[key];
    else delete next[key];
  }
  return next;
}

export function sameStoredValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = Object.entries(a), right = Object.entries(b);
  return left.length === right.length && left.every(([key, value]) =>
    Object.hasOwn(b, key) && sameStoredValue(value, (b as Record<string, unknown>)[key]));
}

export function restoreMissingClass(current: unknown, restored: Record<string, unknown>) {
  return current === null ? restored : undefined;
}

export function restoreMissingStudent(current: Record<string, unknown> | null, student: Student, changeId: string, change: unknown) {
  if (!current) return undefined;
  const students = (current.students ?? {}) as Record<string, Student>;
  if (Object.hasOwn(students, student.id)) return undefined;
  return {
    ...current,
    students: { ...students, [student.id]: student },
    adminChanges: { ...(current.adminChanges as Record<string, unknown> ?? {}), [changeId]: change },
  };
}
