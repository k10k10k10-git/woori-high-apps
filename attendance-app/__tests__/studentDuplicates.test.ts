import { describe, expect, it } from 'vitest';
import type { Student } from '@/types';
import { assertNoNewStudentDuplicates, findStudentDuplicatePairs, findStudentDuplicates, type DuplicateRoster } from '@/utils/studentDuplicates';

const student = (id: string, values: Partial<Student> = {}): Student => ({ id, name: '가학생', ...values });
const roster = (left: Student, right: Student): DuplicateRoster => ({
  '2-1-4': { students: { [left.id]: left } },
  '2-1-6': { students: { [right.id]: right } },
});

describe('학생 명단 중복 예방', () => {
  it('서로 다른 SID와 personId여도 이름·유효 생일이 같으면 강한 중복으로 찾는다', () => {
    const left = student('S14_15', { name: '214 가 학생A', birth: '2010. 01. 02', personId: 'person_student_old' });
    const right = student('S16_15', { birth: '20100102', personId: 'person_student_new' });
    const input = roster(left, right), before = structuredClone(input);
    expect(findStudentDuplicatePairs(input)).toEqual([{ left: { classKey: '2-1-4', studentId: left.id, student: left }, right: { classKey: '2-1-6', studentId: right.id, student: right }, reason: 'birth', strong: true }]);
    expect(input).toEqual(before);
  });

  it('동일 personId는 이름·연락처가 달라도 중복으로 표시한다', () => {
    expect(findStudentDuplicatePairs(roster(student('a', { personId: 'person_student_same' }), student('b', { name: '나학생', personId: 'person_student_same' }))))
      .toMatchObject([{ reason: 'personId', strong: true }]);
  });

  it('생일 누락 시 이름과 유효한 본인 전화가 같으면 강한 중복으로 찾는다', () => {
    const left = student('a', { phone: '010-1234-5678', personId: 'person_student_a' });
    const right = student('b', { phone: '+82 10 1234 5678', personId: 'person_student_b' });
    expect(findStudentDuplicatePairs(roster(left, right))).toMatchObject([{ reason: 'phone', strong: true }]);
  });

  it('생일이 다른 동명이인은 본인 전화가 같아도 강한 중복으로 차단하지 않는다', () => {
    const left = student('a', { birth: '2010-01-02', phone: '01012345678' });
    const right = student('b', { birth: '2010-01-03', phone: '01012345678' });
    const input = roster(left, right);
    expect(findStudentDuplicatePairs(input)).toMatchObject([{ reason: 'name', strong: false }]);
    expect(() => assertNoNewStudentDuplicates(right, input, { classKey: '2-1-6', studentId: 'b' })).not.toThrow();
  });

  it.each([
    { birth: '2010-02-30' }, { birth: '2010' }, { birth: '미등록' },
    { phone: '12345678' }, { phone: '01000000000' }, { phone: '미등록' },
    { pphone: '01012345678' },
  ])('이름만 일치하거나 잘못된 생일·전화·보호자 전화만 일치하면 확인 후보로만 남긴다: %j', values => {
    expect(findStudentDuplicatePairs(roster(student('a', values), student('b', values))))
      .toMatchObject([{ reason: 'name', strong: false }]);
  });

  it('다른 이름에 같은 본인·보호자 전화가 있어도 자동 동일인으로 보지 않는다', () => {
    expect(findStudentDuplicatePairs(roster(student('a', { phone: '01012345678', pphone: '01087654321' }), student('b', { name: '나학생', phone: '01012345678', pphone: '01087654321' })))).toEqual([]);
  });

  it('같은 반의 별도 학생 키도 검사하고 자기 키만 제외한다', () => {
    const first = student('a', { birth: '2010-01-02' });
    const input = { '2-1-4': { students: { a: first, b: student('b', { birth: '2010-01-02' }) } } };
    expect(findStudentDuplicates(first, input, { classKey: '2-1-4', studentId: 'a' })).toMatchObject([{ studentId: 'b', strong: true }]);
    expect(findStudentDuplicatePairs(input)).toHaveLength(1);
  });

  it('새로운 강한 중복은 저장 전에 중단하고 기존 신상·명단은 변경하지 않는다', () => {
    const existing = student('a', { birth: '2010-01-02' }), incoming = student('b', { birth: '2010. 01. 02' });
    const input = roster(existing, incoming), before = structuredClone(input);
    expect(() => assertNoNewStudentDuplicates(incoming, input, { classKey: '2-1-6', studentId: 'b' })).toThrow('2부 1학년 4반');
    expect(input).toEqual(before);
  });

  it('이미 존재하던 강한 중복의 주소·보호자 전화 등 무관한 정보 수정은 허용한다', () => {
    const existing = student('a', { birth: '2010-01-02' }), previous = student('b', { birth: '2010-01-02' });
    const next = { ...previous, addr: '새 주소', pphone: '01087654321', school: '새 학교' };
    expect(() => assertNoNewStudentDuplicates(next, roster(existing, next), { classKey: '2-1-6', studentId: 'b' }, previous)).not.toThrow();
  });

  it('이전에는 동명이인이었어도 생일 수정으로 새로 동일인 중복이 되면 중단한다', () => {
    const existing = student('a', { birth: '2010-01-02' }), previous = student('b', { birth: '2010-01-03' });
    const next = { ...previous, birth: '2010-01-02' };
    expect(() => assertNoNewStudentDuplicates(next, roster(existing, next), { classKey: '2-1-6', studentId: 'b' }, previous)).toThrow('동일 학생');
  });

  it('비정상 옛 신상 값과 비어 있는 반이 있어도 오류 없이 명단을 보존한다', () => {
    const left = student('a', { birth: null, phone: 123, name: '가학생' } as unknown as Partial<Student>);
    const right = student('b', { birth: null, phone: 123 } as unknown as Partial<Student>);
    const input = { ...roster(left, right), empty: {} };
    expect(findStudentDuplicatePairs(input)).toMatchObject([{ reason: 'name', strong: false }]);
  });
});
