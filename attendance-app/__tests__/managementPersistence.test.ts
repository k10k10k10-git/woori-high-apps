import { expect, it } from 'vitest';
import { mergeStudentEdit } from '@/utils/studentPersistence';
import { trashEntries, trashRecordKey } from '@/utils/trash';

it('편집하지 않은 필드의 최신 원격 값을 보존한다', () => {
  const opened = { id: 's', personId: 'person_s', name: '학생', phone: 'old', school: '이전 학교', jang: true };
  const latest = { ...opened, phone: 'remote', num: 8 };
  expect(mergeStudentEdit(latest, opened, { name: '학생', phone: 'old', school: '새 학교' }))
    .toEqual({ ...latest, school: '새 학교' });
});
it('같은 필드를 서로 다르게 수정하면 최신 원장을 덮지 않는다', () => {
  const opened = { id: 's', personId: 'person_s', name: '학생', phone: 'old' };
  expect(mergeStudentEdit({ ...opened, phone: 'remote' }, opened, { name: '학생', phone: 'mine' })).toBeUndefined();
  expect(mergeStudentEdit({ ...opened, phone: 'mine' }, opened, { name: '학생', phone: 'mine' })?.phone).toBe('mine');
});
it('다른 반과 재삭제의 키는 구분되고 레거시 키도 원래 키로 읽는다', () => {
  const keys = [trashRecordKey('1-1-1','s','a'), trashRecordKey('1-1-2','s','a'), trashRecordKey('1-1-1','s','b')];
  expect(new Set(keys).size).toBe(3);
  const rows = trashEntries({ s: { deletedAt: 1, id: 's' }, [keys[0]]: { deletedAt: 2, id: 's' } });
  expect(rows.map(row => row.key)).toEqual([keys[0], 's']);
  expect(rows.map(row => row.value.id)).toEqual(['s', 's']);
});
