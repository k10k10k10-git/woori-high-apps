import { describe, expect, it } from 'vitest';
import { createPersonId, findHistoricalPersonId, findHistoricalStudentPersonId } from '@/utils/personId';

describe('영구 personId', () => {
  it('유형 namespace를 포함한 새 ID를 만든다', () => {
    expect(createPersonId('student', () => '123e4567-e89b-12d3-a456-426614174000'))
      .toBe('person_student_123e4567e89b12d3a456426614174000');
  });

  it('교사·스탭은 이름과 생년 또는 본인 연락처가 일치하는 유일한 과거 ID만 재사용한다', () => {
    const roots = [{
      2026: {
        one: { name: '김교사', birth: '1980-01-02', phone: '010-1111-2222', personId: 'person_teacher_fixed' },
      },
    }];
    expect(findHistoricalPersonId('teacher', { name: '김 교사', birth: '1980.01.02' }, roots))
      .toBe('person_teacher_fixed');
    expect(findHistoricalPersonId('staff', { name: '김교사', birth: '1980.01.02' }, roots))
      .toBeNull();
  });

  it('동일 근거에 서로 다른 과거 ID가 둘이면 자동 재사용하지 않는다', () => {
    const roots = [{
      2025: { one: { name: '이동명', phone: '010-3333-4444', personId: 'person_staff_one' } },
      2026: { two: { name: '이동명', phone: '010-3333-4444', personId: 'person_staff_two' } },
    }];
    expect(findHistoricalPersonId('staff', { name: '이동명', phone: '01033334444' }, roots)).toBeNull();
  });

  it('학생은 생년월일과 본인 연락처가 모두 같은 유일한 과거 ID만 재사용한다', () => {
    const roots = [{ 2025: { cls: { students: {
      one: { name: '김예원', birth: '2010-01-02', phone: '010-1111-2222', personId: 'person_student_fixed' },
    } } } }];
    expect(findHistoricalStudentPersonId({ name: '김 예원', birth: '2010.01.02', phone: '01011112222' }, roots))
      .toBe('person_student_fixed');
    expect(findHistoricalStudentPersonId({ name: '김예원', birth: '2010.01.02', phone: '' }, roots)).toBeNull();
  });
});
