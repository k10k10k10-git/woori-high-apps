import { describe, expect, it } from 'vitest';
import { uniqueRosterStudent } from './rosterIdentity';
describe('이동 후 공식 학생 연결', () => {
  const moved = { personId: 'person_student_a', name: '이동 학생' };
  it('ID 충돌의 기존 학생과 이동 학생을 영구 ID로 구별한다', () => {
    expect(uniqueRosterStudent({ '1-1-7': { students: { S17_05: { personId: 'person_student_b' }, '-new': moved } } }, moved.personId)).toBe(moved);
  });
  it('중복·없는 영구 ID와 이름만 같은 학생은 연결하지 않는다', () => {
    const classes = { a: { students: { x: moved, y: moved } } };
    expect(uniqueRosterStudent(classes, moved.personId)).toBeNull();
    expect(uniqueRosterStudent(classes, undefined)).toBeNull();
    expect(uniqueRosterStudent(classes, 'person_staff_a')).toBeNull();
  });
});
