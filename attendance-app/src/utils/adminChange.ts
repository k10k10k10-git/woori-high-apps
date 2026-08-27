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
 * 실제 값을 그대로 남기는 필드.
 *
 * 감사 기록은 통합 플랫폼의 행정 변동 사항에 그대로 노출된다. 연락처·주소·생년월일을
 * 여기 넣으면 목록을 보는 사람 누구나 학생과 보호자의 연락처를 평문으로 보게 되므로
 * **넣지 않는다**. 학교와 이름은 반 명단에서 이미 보이는 값이라 남겨도 새로 드러나는
 * 정보가 없고, "무엇에서 무엇으로 바뀌었는지"가 확인의 핵심이라 값을 남긴다.
 */
const VALUE_FIELDS = new Set<keyof Student>(['name', 'school']);

/** 값을 인용할 때만 쓰는 괄호. 이름에 공백이 있어도 어디까지가 값인지 읽힌다. */
const quote = (value: string) => `「${value}」`;

/**
 * 무엇이 어떻게 바뀌었는지 한 줄로 적는다.
 *
 * VALUE_FIELDS는 `학교 「한빛고」 → 「서현고」`처럼 값을 그대로 남기고, 나머지 민감
 * 필드는 `보호자 연락처 변경`처럼 필드 이름과 작업만 남긴다. 값을 자르지는 않는다 —
 * 표시 쪽에서 접었다 펴므로 기록은 온전해야 한다.
 */
export function describeStudentFieldChanges(before: Student, after: Student): string[] {
  return FIELD_LABELS.flatMap(([key, label]) => {
    const previous = comparable(before[key]);
    const next = comparable(after[key]);
    if (previous === next) return [];
    const withValue = VALUE_FIELDS.has(key);
    if (previous === '' && next !== '') {
      return [withValue ? `${label} ${quote(String(next))} 입력` : `${label} ${label === '사진' ? '등록' : '입력'}`];
    }
    if (previous !== '' && next === '') {
      return [withValue ? `${label} ${quote(String(previous))} 삭제` : `${label} 삭제`];
    }
    return [withValue ? `${label} ${quote(String(previous))} → ${quote(String(next))}` : `${label} 변경`];
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
