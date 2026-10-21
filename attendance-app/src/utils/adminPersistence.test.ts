import { describe, expect, it } from 'vitest';
import { createAccountRecord, createTeacherRecord, deleteAccountRecord, deleteTeacherRecord, mergeAccountEdit } from './adminPersistence';

describe('admin persistence guards', () => {
  it('교사 수정 삭제에서 숨겨진 필드와 동시 변경을 보존한다', () => {
    const opened = { title: '스탭', name: '김교사', phone: '010', personId: 'person_staff_1', memo: '보존' };
    expect(deleteTeacherRecord({ ...opened }, opened)).toEqual({ alreadyDeleted: false, value: null });
    expect(deleteTeacherRecord({ ...opened, memo: '원격 변경' }, opened)).toBeUndefined();
    expect(deleteTeacherRecord(null, opened)).toEqual({ alreadyDeleted: true });
    expect(createTeacherRecord({ ...opened }, opened, 'person_staff_1')).toBeUndefined();
  });

  it('계정 폼의 변경 필드만 병합하고 name과 미지 필드를 보존한다', () => {
    const opened = { email: 'teacher@example.com', role: 'teacher' as const, part: '1', grade: '1', class: '1', name: '김교사', memo: '보존' };
    const current = { ...opened, memo: '원격 변경' };
    expect(mergeAccountEdit(current, opened, { email: opened.email, role: 'teacher', part: '1', grade: '1', class: '2' }))
      .toEqual({ ...current, class: '2' });
    expect(mergeAccountEdit({ ...current, class: '3' }, opened, { email: opened.email, role: 'teacher', part: '1', grade: '1', class: '2' }))
      .toBeUndefined();
  });

  it('기존 이메일 키에는 신규 계정을 덮어쓰지 않는다', () => {
    const form = { email: 'teacher@example.com', role: 'teacher' as const, part: '1', grade: '1', class: '1' };
    expect(createAccountRecord({ email: form.email, role: 'teacher', name: '기존' }, form)).toBeUndefined();
    expect(createAccountRecord(null, form)).toEqual(form);
  });

  it('계정은 열린 뒤 필드가 바뀌었으면 삭제하지 않는다', () => {
    const opened = { email: 'teacher@example.com', role: 'teacher' as const, part: '1', grade: '1', class: '1', name: '김교사' };
    expect(deleteAccountRecord({ ...opened }, opened)).toEqual({ alreadyDeleted: false, value: null });
    expect(deleteAccountRecord({ ...opened, class: '2' }, opened)).toBeUndefined();
    expect(deleteAccountRecord(null, opened)).toEqual({ alreadyDeleted: true });
  });
});
