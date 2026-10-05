import { expect, it } from 'vitest';
import { mergeTeacherEdit } from '@/utils/teacherPersistence';
it('수정하지 않은 연락처와 추가 필드는 최신값을 보존한다', () => {
  const opened = { name: '가상 교사', phone: 'old', personId: 'person_teacher_a' };
  expect(mergeTeacherEdit({ ...opened, phone: 'remote', memo: 'keep' }, opened, { ...opened, name: '변경 교사' }, opened.personId)).toMatchObject({ name: '변경 교사', phone: 'remote', memo: 'keep' });
});
it('같은 필드의 원격 수정과 신원 변경은 거절한다', () => {
  const opened = { name: '가상 교사', personId: 'person_teacher_a' };
  expect(mergeTeacherEdit({ ...opened, name: '원격 수정' }, opened, { name: '다른 수정' }, opened.personId)).toBeUndefined();
  expect(mergeTeacherEdit({ ...opened, personId: 'person_teacher_b' }, opened, opened, opened.personId)).toBeUndefined();
});
it('처음 등록하는 특별 교사의 기본 직급도 보존한다', () => {
  const opened = { title: '부장', name: '', phone: '' };
  expect(mergeTeacherEdit(null, opened, { ...opened, name: '새 부장' }, 'person_teacher_new'))
    .toMatchObject({ title: '부장', name: '새 부장', personId: 'person_teacher_new' });
});
it('신원 ID 없는 기존 교사가 삭제된 경우 이전 편집을 재생하지 않는다', () => {
  expect(mergeTeacherEdit(null, { name: '기존 교사' }, { name: '수정 이름' }, 'person_teacher_new')).toBeUndefined();
});
