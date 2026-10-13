import { describe, expect, it } from 'vitest';
import { initialState, type AppState } from '@/store/AppContext';
import { buildYouthHandoff, handoffBirth, youthHandoffCells, youthHandoffWorkbookRows, YOUTH_HANDOFF_COLUMNS } from '@/utils/youthHandoff';
import { getSundaysForYear } from '@/utils/dates';

const now = Date.parse('2026-11-01T00:00:00+09:00');
function source(): AppState {
  return { ...initialState, curYear: 2026, curView: 'first', curPart: '1', curGrade: '1', curClass: '1', months: getSundaysForYear(2026), events: { '0-1': '행사' },
    classData: {
      '1-3-1': { students: [{ id: 'a', name: '가학생', birth: '2008.02.29', phone: '010-0000-0001', pphone: '010-0000-0002', school: '가상고', addr: '가상 주소' }] },
      '2-3-2': { students: [{ id: 'a', name: '가학생', jang: true }, { id: 'b', name: '나학생' }] },
      '1-2-1': { students: [{ id: 'other', name: '고2' }] }, '3-3-1': { students: [{ id: 'other', name: '다른 부서' }] },
    }, attData: { '1-3-1': { a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '9-0': 'O', '10-0': 'O', '11-0': 'X' } }, '2-3-2': { a: { '0-0': 'X' } } },
  };
}
describe('전체 고3 청년부 인계', () => {
  it.each([
    ['2008. 01. 31', '2008-01-31'],
    ['2008. 04. 01', '2008-04-01'],
    ['2008. 08. 06', '2008-08-06'],
    [' 2008. 1. 31. ', '2008-01-31'],
    ['2008 / 4 / 1', '2008-04-01'],
    ['2008-8-6', '2008-08-06'],
    ['2008.\u00a002.\u00a029.', '2008-02-29'],
    ['2008-01-21', '2008-01-21'],
    ['20080229', '2008-02-29'],
  ])('생년월일 %s의 구분자·공백을 변환해 %s로 표시한다', (input, expected) => {
    expect(handoffBirth(input)).toBe(expected);
  });
  it.each(['2009. 02. 29', '2008. 04. 31', '2008. 13. 01', '2008. 00. 10', '2008. 01. 00', '08. 01. 31', '2008131', '2008년생', '2008. 01', '2008. 01. 31 메모'])('유효하지 않거나 불완전한 생년월일 %s는 추정하지 않는다', input => {
    expect(handoffBirth(input)).toBe(`확인 필요 (${input})`);
  });
  it('표기만 다른 생년월일을 확인 필요로 집계하지 않고 원본을 보존해 엑셀 날짜로 내보낸다', () => {
    const state = source();
    state.classData = { '1-3-1': { students: [{ ...state.classData['1-3-1'].students[0], birth: '2008. 01. 31' }] } };
    const before = structuredClone(state);
    const report = buildYouthHandoff(state, now);
    expect(report.reviewCount).toBe(0);
    expect(report.rows[0].birth).toBe('2008-01-31');
    expect(youthHandoffWorkbookRows(report)[6][1]).toEqual(new Date(2008, 0, 31));
    expect(state).toEqual(before);
  });
  it('부서·학기·반 화면 선택과 관계없이 1·2부 고3 장결·미입력·동명이인을 모두 포함한다', () => {
    const state = source(); const before = structuredClone(state);
    const report = buildYouthHandoff(state, now);
    expect(report.rows).toHaveLength(3);
    expect([report.firstPartCount, report.secondPartCount]).toEqual([1, 2]);
    expect(report.rows.map(row => `${row.classKey}/${row.student.id}`)).toEqual(['1-3-1/a', '2-3-2/a', '2-3-2/b']);
    expect(state).toEqual(before);
  });
  it('추출일(KST)까지의 정상 주일만 기존 출석률·등급으로 계산하고 월 인덱스를 보존한다', () => {
    const report = buildYouthHandoff(source(), now);
    expect(report).toMatchObject({ startsOn: '2026-01-01', endsOn: '2026-11-01', extractedOn: '2026-11-01', futureYear: false });
    expect(report.rows[0]).toMatchObject({ rate: 75, grade: 'C' });
    expect(report.rows[1]).toMatchObject({ rate: 0, grade: 'D' });
    expect(report.rows[2]).toMatchObject({ rate: null, grade: '산정 불가' });
    expect(report.unratedCount).toBe(1);
  });
  it('과거 연도는 연말까지, 미래 연도는 아직 시작 전으로 표시한다', () => {
    expect(buildYouthHandoff(source(), Date.parse('2027-01-01T00:00:00+09:00')).endsOn).toBe('2026-12-31');
    const future = buildYouthHandoff({ ...source(), curYear: 2027, months: getSundaysForYear(2027) }, now);
    expect(future.futureYear).toBe(true);
    expect(future.rows.every(row => row.rate === null)).toBe(true);
  });
  it('정보 누락·잘못된 생년월일은 제외·추정하지 않고 표시한다', () => {
    expect(handoffBirth()).toBe('미등록');
    expect(handoffBirth('2008.02.29')).toBe('2008-02-29');
    expect(handoffBirth('20080229')).toBe('2008-02-29');
    expect(handoffBirth('2009-02-29')).toBe('확인 필요 (2009-02-29)');
    expect(handoffBirth('2008')).toBe('확인 필요 (2008)');
    const report = buildYouthHandoff(source(), now);
    expect(report.reviewCount).toBe(2);
    expect(youthHandoffCells(report.rows[2])).toEqual(['나학생', '미등록', '미등록', '미등록', '미등록', '미등록', '산정 불가', '산정 불가']);
  });
  it('8개 열·기간·추출일·총인원을 담고 생년월일·출석률은 실제 날짜·숫자로 내보낸다', () => {
    const report = buildYouthHandoff(source(), now); const cells = youthHandoffWorkbookRows(report);
    expect(cells[5]).toEqual(YOUTH_HANDOFF_COLUMNS);
    expect(cells[1][0]).toContain('추출일: 2026-11-01');
    expect(cells[2][0]).toContain('전체 3명');
    expect(cells.slice(6).every(row => row.length === 8)).toBe(true);
    expect(cells[6]).toEqual(['가학생', new Date(2008, 1, 29), '010-0000-0001', '010-0000-0002', '가상고', '가상 주소', .75, 'C']);
    expect(cells[7][6]).toBe(0);
  });
  it.each([[90, 'A'], [80, 'B'], [70, 'C'], [60, 'D']] as const)('등급 경계 %i%%는 %s', (rate, grade) => {
    const state = source(); state.months = [{ month: 1, sundays: Array.from({ length: 10 }, (_, i) => i + 1) }]; state.events = {};
    state.attData = { '1-3-1': { a: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`0-${i}`, i < rate / 10 ? 'O' : 'X'])) } };
    expect(buildYouthHandoff(state, now).rows[0]).toMatchObject({ rate, grade });
  });
  it('이전 지각도 출석으로 정규화한다', () => {
    const state = source(); state.events = {}; state.attData = { '1-3-1': { a: { '0-0': 'T', '0-1': 'X' } } } as unknown as AppState['attData'];
    expect(buildYouthHandoff(state, now).rows[0]).toMatchObject({ rate: 50, grade: 'D' });
  });
});
