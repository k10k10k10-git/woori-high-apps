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

  it('학생은 연락처가 달라도 이름·생년월일·부서·정상 진급이 유일한 과거 ID를 재사용한다', () => {
    const roots = [{ 2025: { '1-2-6': { students: {
      one: { name: '김예원', birth: '2010-01-02', phone: '010-1111-2222', personId: 'person_student_fixed' },
    } } } }];
    expect(findHistoricalStudentPersonId(
      { name: '김 예원', birth: '2010.01.02', phone: '' },
      roots,
      { year: 2026, classKey: '1-3-4' },
    )).toBe('person_student_fixed');
  });

  it('같은 연도에 이름·생년월일 후보가 둘이면 자동 재사용하지 않는다', () => {
    const roots = [{
      2025: {
        '1-2-1': { students: { one: { name: '이동명', birth: '2010-01-02', personId: 'person_student_one' } } },
        '1-2-2': { students: { two: { name: '이동명', birth: '2010-01-02', personId: 'person_student_two' } } },
      },
    }];
    expect(findHistoricalStudentPersonId(
      { name: '이동명', birth: '2010-01-02' },
      roots,
      { year: 2026, classKey: '1-3-1' },
    )).toBeNull();
  });

  it('부서가 다르거나 정상 진급이 아니면 과거 ID를 재사용하지 않는다', () => {
    const roots = [{ 2025: { '2-2-6': { students: {
      one: { name: '김예원', birth: '2010-01-02', personId: 'person_student_fixed' },
    } } } }];
    expect(findHistoricalStudentPersonId(
      { name: '김예원', birth: '2010-01-02' },
      roots,
      { year: 2026, classKey: '1-3-4' },
    )).toBeNull();
    expect(findHistoricalStudentPersonId(
      { name: '김예원', birth: '2010-01-02' },
      roots,
      { year: 2026, classKey: '2-2-4' },
    )).toBeNull();
  });
});
