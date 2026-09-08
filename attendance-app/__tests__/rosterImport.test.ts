import { expect, it } from 'vitest';
import { parseRosterInput, planRosterImport } from '@/utils/rosterImport';
it('CSV 헤더·따옴표·탭 입력을 읽고 헤더 없는 첫 학생을 보존한다', () => {
  expect(parseRosterInput('이름,생년월일,연락처\n"홍,길동",2010-01-01,010-1111-2222')[0].name).toBe('홍,길동');
  expect(parseRosterInput('홍길동\t2010-01-01\t010-1111-2222')).toHaveLength(1);
  expect(parseRosterInput('홍길동,2010-01-01,010-1111-2222')).toHaveLength(1);
});
it('기존 명단의 ID·사진·장결·연락처를 보존하고 신규 학생만 추가한다', () => {
  const old = { id: 'old', name: '기존', birth: '2010-01-01', phone: '01011112222', photo: 'photo', jang: true };
  const plan = planRosterImport([{ name: '기존', birth: '20100101' }, { name: '새 학생' }], { old }, 'append', 'op');
  expect(plan.students.old).toEqual(old);
  expect(plan).toMatchObject({ added: 1, retained: 1, removed: 0 });
});
it('이름만 같은 학생을 자동 연결하거나 입력 중복을 조용히 적용하지 않는다', () => {
  expect(() => planRosterImport([{ name: '같은 이름' }], { old: { id: 'old', name: '같은 이름' } }, 'append', 'op')).toThrow('구분');
  expect(() => planRosterImport([{ name: '학생' }, { name: '학생' }], {}, 'append', 'op')).toThrow('중복');
});
it('교체에서도 확인된 기존 ID를 유지하고 제외 수를 정확히 표시한다', () => {
  const old = { id: 'old', name: '기존', birth: '2010-01-01' };
  const result = planRosterImport([{ name: '기존', birth: '20100101' }], { old, other: { id: 'other', name: '다른 학생' } }, 'replace', 'op');
  expect(result.students).toEqual({ old }); expect(result.removed).toBe(1);
});
