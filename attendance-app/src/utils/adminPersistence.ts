import type { UserRole } from '@/types';
import type { TeacherFields } from './teacherPersistence';

const EDITABLE_TEACHER_FIELDS = ['title', 'name', 'phone', 'birth'] as const;
const ASSIGNMENT_FIELDS = ['part', 'grade', 'class'] as const;

function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function sameValue(left: unknown, right: unknown) {
  return normalized(left) === normalized(right);
}

function sameRecord(left: Record<string, unknown> | null, right: Record<string, unknown> | null) {
  if (!left || !right) return left === right;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(key => sameValue(left[key], right[key]));
}

/** 새 항목은 비어 있는 키에만 만들며, 우연히 겹친 기존 항목을 합치지 않는다. */
export function createTeacherRecord(current: TeacherFields | null, values: TeacherFields, personId: string) {
  if (current !== null) return undefined;
  const next: TeacherFields = {};
  for (const key of EDITABLE_TEACHER_FIELDS) next[key] = String(values[key] ?? '').trim();
  next.personId = personId;
  return next;
}

/** 삭제는 폼을 열 때 본 항목이 그대로일 때만 허용한다. */
export function deleteTeacherRecord(current: TeacherFields | null, opened: TeacherFields) {
  if (current === null) return { alreadyDeleted: true as const };
  return sameRecord(current, opened) ? { alreadyDeleted: false as const, value: null } : undefined;
}

export type EditableAccount = UserRole & Record<string, unknown>;
export type AccountForm = { email: string; role: 'admin' | 'teacher'; part: string; grade: string; class: string };

/** 계정 폼에서 사용자가 바꾼 필드만 최신 레코드에 병합하고, name 등 폼 밖 필드는 보존한다. */
export function mergeAccountEdit(current: EditableAccount | null, opened: EditableAccount, form: AccountForm) {
  if (!current) return undefined;
  const next: EditableAccount = { ...current };
  const desired: EditableAccount = { email: form.email.trim(), role: form.role };
  if (form.role === 'teacher') Object.assign(desired, { part: form.part, grade: form.grade, class: form.class });

  const changed = new Set<string>();
  for (const key of ['email', 'role', ...ASSIGNMENT_FIELDS]) {
    const desiredValue = desired[key];
    const openedValue = opened[key];
    if (key === 'email' || key === 'role' || form.role === 'teacher') {
      if (!sameValue(desiredValue, openedValue)) changed.add(key);
    } else if (opened.role === 'teacher') {
      changed.add(key);
    }
  }

  for (const key of changed) {
    const latest = current[key];
    const before = opened[key];
    const after = desired[key];
    if (!sameValue(latest, before) && !sameValue(latest, after)) return undefined;
    if (after === undefined) delete next[key]; else next[key] = after;
  }
  return next;
}

export function createAccountRecord(current: EditableAccount | null, form: AccountForm) {
  if (current !== null) return undefined;
  const next: EditableAccount = { email: form.email.trim(), role: form.role };
  if (form.role === 'teacher') Object.assign(next, { part: form.part, grade: form.grade, class: form.class });
  return next;
}

/** 계정 삭제도 폼을 열 때 본 전체 레코드가 그대로일 때만 허용한다. */
export function deleteAccountRecord(current: EditableAccount | null, opened: EditableAccount) {
  if (current === null) return { alreadyDeleted: true as const };
  return sameRecord(current, opened) ? { alreadyDeleted: false as const, value: null } : undefined;
}
