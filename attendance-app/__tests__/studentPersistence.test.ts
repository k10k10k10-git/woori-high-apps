import { describe, expect, it } from 'vitest';
import { editStudent, mergeStudentEdit, restoreMissingClass, restoreMissingStudent, sameStoredValue } from '@/utils/studentPersistence';

describe('학생 원장 보존', () => {
  it('동일 SID의 다른 인물과 신원 없는 옛 명단의 변경은 오래된 수정창에서 저장하지 않는다', () => {
    const opened = { id: 's', name: '합성 A', personId: 'person_A' };
    expect(mergeStudentEdit({ ...opened, name: '합성 B', personId: 'person_B' }, opened,
      { name: opened.name, school: 'A 학교' })).toBeUndefined();
    const legacy = { id: 's', name: '합성 A' };
    expect(mergeStudentEdit({ ...legacy, name: '합성 B' }, legacy, { name: legacy.name, school: 'A 학교' })).toBeUndefined();
    expect(mergeStudentEdit({ ...opened, phone: 'remote' }, opened, { name: opened.name, school: '학교' }))
      .toMatchObject({ phone: 'remote', school: '학교', personId: 'person_A' });
  });
  it('일반 편집은 장결·번호·미래 필드를 보존하고 비운 연락처만 삭제한다', () => {
    const before = { id: 's', name: '이름', jang: true, num: 8, personId: 'person', phone: 'old', future: true };
    expect(editStudent(before, 's', 'fallback', { name: ' 수정 ', phone: '' })).toEqual({
      id: 's', name: '수정', jang: true, num: 8, personId: 'person', future: true,
    });
  });
  it('이미 생긴 반과 같은 ID의 학생은 복원으로 덮지 않는다', () => {
    const student = { id: 's', name: '옛 이름' };
    expect(restoreMissingClass({}, { teacher: '옛 교사' })).toBeUndefined();
    expect(restoreMissingClass(null, { teacher: '옛 교사' })).toEqual({ teacher: '옛 교사' });
    expect(restoreMissingStudent(null, student, 'log', {})).toBeUndefined();
    expect(restoreMissingStudent({ students: { s: { name: '새 이름' } } }, student, 'log', {})).toBeUndefined();
    expect(restoreMissingStudent({ teacher: '교사', students: { other: {} } }, student, 'log', {}))
      .toMatchObject({ teacher: '교사', students: { other: {}, s: student }, adminChanges: { log: {} } });
  });
  it('휴지통 사본과 미리보기 대조는 순서를 무시하고 최신 변경은 구분한다', () => {
    expect(sameStoredValue({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(sameStoredValue({ deletedAt: 1 }, { deletedAt: 2 })).toBe(false);
    expect(sameStoredValue({ s: { day: 'O' } }, { s: { day: 'X' } })).toBe(false);
  });
});
