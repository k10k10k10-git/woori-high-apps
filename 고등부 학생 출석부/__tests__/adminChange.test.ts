import { describe, expect, it } from 'vitest';
import {
  adminActor,
  adminChangePath,
  buildAdminChangeEntry,
  changedStudentFieldLabels,
  describeStudentFieldChanges,
} from '@/utils/adminChange';

describe('행정 변동 감사 기록', () => {
  it('민감한 실제 값 대신 변경된 필드 이름만 요약한다', () => {
    expect(changedStudentFieldLabels(
      { id: 's1', name: '김학생', phone: '010-1111-1111', school: '우리중' },
      { id: 's1', name: '김학생', phone: '010-9999-9999', school: '우리서고' },
    )).toEqual(['본인 연락처', '학교']);
  });

  it('학교 입력·변경·삭제를 실제 값 없이 구분한다', () => {
    const base = { id: 's1', name: '김학생', school: '' };
    expect(describeStudentFieldChanges(base, { ...base, school: '우리중' })).toEqual(['학교 입력']);
    expect(describeStudentFieldChanges({ ...base, school: '우리중' }, { ...base, school: '우리서고' })).toEqual(['학교 변경']);
    expect(describeStudentFieldChanges({ ...base, school: '우리중' }, base)).toEqual(['학교 삭제']);
  });

  it('반 내부 선택 하위 경로와 완료 기록을 만든다', () => {
    const now = new Date('2026-08-11T12:34:56.000Z');
    expect(adminChangePath(2026, '2-1-9', 'change1')).toBe('classes/2026/2-1-9/adminChanges/change1');
    expect(buildAdminChangeEntry({
      classKey: '2-1-9',
      teacher: '박교사',
      student: { id: 's1', personId: 'person_student_1', name: '이다미' },
      action: '학생 정보 수정',
      changeSummary: '학교 수정',
      actor: '김수현',
      now,
    })).toEqual({
      changedAt: '2026-08-11T12:34:56.000Z',
      changedAtMs: now.getTime(),
      classKey: '2-1-9',
      teacher: '박교사',
      studentId: 's1',
      personId: 'person_student_1',
      studentName: '이다미',
      action: '학생 정보 수정',
      changeSummary: '학교 수정',
      result: '반영 완료',
      actor: '김수현',
    });
  });

  it('담당자 이름이 없으면 관리자 표기를 사용한다', () => {
    expect(adminActor({ role: 'admin', email: 'admin@example.com' })).toBe('출석부 관리자');
  });
});
