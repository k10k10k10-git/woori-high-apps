import { expect, it } from 'vitest';
import { read, write, utils } from 'xlsx';
import { initialState } from '@/store/AppContext';
import { buildPastoralReport } from '@/utils/pastoralReport';
import { pastoralContactWorkbook } from '@/utils/pastoralContactExport';

function fixture() {
  const state = { ...initialState, curYear: 2026, months: [{ month: 1, sundays: [4, 11, 18, 25] }], events: {},
    classData: {
      '1-1-1': { students: [{ id: 'a', name: '같은 이름', phone: '01000000001', pphone: '보호자 비공개', addr: '주소 비공개' }, { id: 'b', name: '장결 학생', jang: true }] },
      '2-3-7': { students: [{ id: 'a', name: '같은 이름', phone: '+821000000002' }, { id: 'b', name: '복귀 학생', phone: '010-0000-0003' }] },
    }, attData: {
      '1-1-1': { a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' }, b: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'X' } },
      '2-3-7': { a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' }, b: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'O' } },
    },
  } as typeof initialState;
  return { state, report: buildPastoralReport(state, [], Date.parse('2026-02-01T00:00:00+09:00'), '0-3') };
}
it('모든 부서·학년·장결·동명이인과 연락처 누락 학생도 포함하며 원본을 보존한다', () => {
  const { state, report } = fixture(); const before = structuredClone(state);
  const file = pastoralContactWorkbook(report, 2026, 'absent', 'absence');
  expect(file.count).toBe(3); expect(file.rows.slice(6)).toHaveLength(3);
  expect(file.rows[2][0]).toContain('본인 연락처 미등록 1명'); expect(file.rows[2][0]).toContain('필터 미적용');
  expect(file.rows.slice(6).filter(row => row[0] === '같은 이름')).toHaveLength(2);
  expect(file.rows.slice(6).find(row => row[0] === '장결 학생')).toEqual(['장결 학생', '미등록', '1부 1학년 1반', '장결', 4, '기록 없음']);
  expect(JSON.stringify(file.rows)).not.toContain('보호자 비공개'); expect(JSON.stringify(file.rows)).not.toContain('주소 비공개'); expect(state).toEqual(before);
});
it('다시 출석 대상만 복귀 직전 결석 횟수와 함께 내보낸다', () => {
  const file = pastoralContactWorkbook(fixture().report, 2026, 'recovered', 'latest');
  expect(file.count).toBe(1); expect(file.filename).toBe('다시출석_전체연락처_2026-01-25.xlsx');
  expect(file.rows[5][4]).toBe('복귀 전 연속 결석 횟수');
  expect(file.rows[6]).toEqual(['복귀 학생', '010-0000-0003', '2부 3학년 7반', '일반', 3, new Date(2026, 0, 25)]);
});
it('조회 주일·행사·미입력 기준을 기존 리포트와 공유한다', () => {
  const { state } = fixture(); state.events = { '0-1': '행사' }; delete state.attData['1-1-1'].b['0-2'];
  const report = buildPastoralReport(state, [], Date.parse('2026-02-01T00:00:00+09:00'), '0-2');
  expect(pastoralContactWorkbook(report, 2026, 'absent', 'absence').count).toBe(0);
  expect(pastoralContactWorkbook(report, 2026, 'recovered', 'absence').count).toBe(0);
  expect(pastoralContactWorkbook(report, 2026, 'absent', 'absence').rows[1][0]).toContain('2026-01-18');
  const empty = buildPastoralReport({ ...state, months: [] }, [], Date.parse('2026-02-01T00:00:00+09:00'));
  expect(() => pastoralContactWorkbook(empty, 2026, 'absent', 'absence')).toThrow('기준 주일');
});
it('복귀 직전 결석이 3회를 넘으면 실제 확인된 횟수를 내보낸다', () => {
  const { state } = fixture(); state.months.push({ month: 2, sundays: [1] });
  state.attData['2-3-7'].b = { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'X', '1-0': 'O' };
  const report = buildPastoralReport(state, [], Date.parse('2026-02-08T00:00:00+09:00'), '1-0');
  expect(pastoralContactWorkbook(report, 2026, 'recovered', 'absence').rows[6][4]).toBe(4);
});
it('XLSX 재읽기에서 전화번호 앞자리·숫자 횟수·날짜 셀을 보존한다', () => {
  const file = pastoralContactWorkbook(fixture().report, 2026, 'absent', 'latest');
  const workbook = utils.book_new(); utils.book_append_sheet(workbook, utils.aoa_to_sheet(file.rows), file.label);
  const sheet = read(write(workbook, { type: 'buffer', bookType: 'xlsx' })).Sheets[file.label];
  const index = file.rows.findIndex(row => row[1] === '01000000001') + 1;
  expect(sheet[`B${index}`]).toMatchObject({ t: 's', v: '01000000001' }); expect(sheet[`B${index}`].f).toBeUndefined();
  expect(sheet[`E${index}`]).toMatchObject({ t: 'n', v: 3 }); expect(sheet[`F${index}`].t).toBe('n');
});
