import type { Student, UserRole } from '@/types';

export type AdminChangeAction = '학생 등록' | '학생 정보 수정' | '학생 삭제' | '반 이동' | '명단 일괄 반영' | '시트 동기화' | '학생 복원';

export type AdminChangeEntry = {
  changedAt: string;
  changedAtMs: number;
  classKey: string;
  teacher: string;
  studentId?: string;
  personId?: string;
  studentName: string;
  action: AdminChangeAction;
  changeSummary: string;
  result: '반영 완료';
  actor: string;
};

const FIELD_LABELS: Array<[keyof Student, string]> = [
  ['name', '이름'],
  ['birth', '생년월일'],
  ['phone', '본인 연락처'],
  ['pphone', '보호자 연락처'],
  ['school', '학교'],
  ['addr', '주소'],
  ['photo', '사진'],
];

const comparable = (value: unknown) => typeof value === 'string' ? value.trim() : value ?? '';

export function changedStudentFieldLabels(before: Student, after: Student): string[] {
  return FIELD_LABELS
    .filter(([key]) => comparable(before[key]) !== comparable(after[key]))
    .map(([, label]) => label);
}

/**
 * 실제 개인정보 값은 남기지 않되, 제3자가 무엇이 일어났는지는 알 수 있게
 * 빈 값과 값 사이의 이동을 입력·삭제로 구분한다.
 */
export function describeStudentFieldChanges(before: Student, after: Student): string[] {
  return FIELD_LABELS.flatMap(([key, label]) => {
    const previous = comparable(before[key]);
    const next = comparable(after[key]);
    if (previous === next) return [];
    if (previous === '' && next !== '') return [`${label} ${label === '사진' ? '등록' : '입력'}`];
    if (previous !== '' && next === '') return [`${label} 삭제`];
    return [`${label} 변경`];
  });
}

export function adminActor(role: UserRole | null): string {
  return role?.name?.trim() || '출석부 관리자';
}

export function buildAdminChangeEntry(input: {
  classKey: string;
  teacher?: string;
  student?: Pick<Student, 'id' | 'personId' | 'name'>;
  studentName?: string;
  action: AdminChangeAction;
  changeSummary: string;
  actor: string;
  now?: Date;
}): AdminChangeEntry {
  const now = input.now ?? new Date();
  return {
    changedAt: now.toISOString(),
    changedAtMs: now.getTime(),
    classKey: input.classKey,
    teacher: input.teacher?.trim() || '미배정',
    ...(input.student?.id ? { studentId: input.student.id } : {}),
    ...(input.student?.personId ? { personId: input.student.personId } : {}),
    studentName: input.student?.name?.trim() || input.studentName?.trim() || '여러 학생',
    action: input.action,
    changeSummary: input.changeSummary.trim(),
    result: '반영 완료',
    actor: input.actor.trim() || '출석부 관리자',
  };
}

export function adminChangePath(year: number | string, classKey: string, changeId: string): string {
  return `classes/${year}/${classKey}/adminChanges/${changeId}`;
}
