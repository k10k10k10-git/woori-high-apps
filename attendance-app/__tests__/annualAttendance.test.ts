import { describe, expect, it } from 'vitest';
import type { AppState } from '@/store/AppContext';
import { annualClassAverageRate } from '@/utils/annualAttendance';

const classKey = '1-1-1';
type Source = Pick<AppState, 'months' | 'attData' | 'events' | 'curView'>;

function makeSource(): Source {
  return {
    months: [
      { month: 1, sundays: [4, 11, 18, 25] },
      { month: 7, sundays: [5, 12, 19, 26] },
    ],
    curView: 'first',
    events: {},
    attData: {},
  };
}

describe('반별 연간 출석률', () => {
  it.each(['first', 'second', 'all'] as const)('다른 화면의 %s 선택과 무관하게 1·2학기를 모두 계산한다', curView => {
    const source = makeSource();
    source.curView = curView;
    source.attData = { [classKey]: { student: { '0-0': 'X', '1-0': 'O' } } };

    expect(annualClassAverageRate(source, classKey, [{ id: 'student', name: '학생' }])).toBe(50);
    expect(source.curView).toBe(curView);
  });

  it('반 전체 입력 건수의 비율 대신 학생별 출석률의 평균을 유지한다', () => {
    const source = makeSource();
    source.attData = {
      [classKey]: {
        short: { '0-0': 'O' },
        long: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' },
      },
    };
    const students = [{ id: 'short', name: '단기' }, { id: 'long', name: '장기' }];

    expect(annualClassAverageRate(source, classKey, students)).toBe(63);
  });

  it('장결 학생은 포함하고 미입력·행사만 있는 학생은 분모에서 제외한다', () => {
    const source = makeSource();
    source.events = { '0-1': '행사' };
    source.attData = {
      [classKey]: {
        active: { '0-0': 'O' },
        jang: { '0-0': 'X' },
        empty: { '0-0': '' },
        eventOnly: { '0-1': 'O' },
      },
    };
    const students = [
      { id: 'active', name: '재적' },
      { id: 'jang', name: '장결', jang: true },
      { id: 'empty', name: '미입력' },
      { id: 'eventOnly', name: '행사 기록만' },
      { id: 'missing', name: '기록 없음' },
    ];

    expect(annualClassAverageRate(source, classKey, students)).toBe(50);
  });

  it('행사와 미입력 주일을 제외하고 지각은 입력 건수에만 포함한다', () => {
    const source = makeSource();
    source.events = { '0-3': '행사' };
    source.attData = { [classKey]: { student: { '0-0': 'O', '0-1': 'X', '0-2': 'T', '0-3': 'O', '1-0': '' } } };

    expect(annualClassAverageRate(source, classKey, [{ id: 'student', name: '학생' }])).toBe(33);
  });

  it('학생별 백분율을 먼저 반올림하는 기존 집계 순서를 유지한다', () => {
    const source = makeSource();
    source.attData = {
      [classKey]: {
        oneThird: { '0-0': 'O', '0-1': 'X', '0-2': 'X' },
        half: { '0-0': 'O', '0-1': 'X' },
      },
    };

    expect(annualClassAverageRate(source, classKey, [{ id: 'oneThird', name: '학생1' }, { id: 'half', name: '학생2' }])).toBe(42);
  });

  it('빈 명단 또는 유효 입력이 없으면 0%로 표시하지 않는다', () => {
    const source = makeSource();

    expect(annualClassAverageRate(source, classKey, [])).toBeNull();
    expect(annualClassAverageRate(source, classKey, [{ id: 'missing', name: '미입력' }])).toBeNull();
    source.attData = { [classKey]: { absent: { '0-0': 'X' } } };
    expect(annualClassAverageRate(source, classKey, [{ id: 'absent', name: '결석' }])).toBe(0);
  });
});
