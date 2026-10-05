import { describe, it, expect } from 'vitest';
import { calcStats } from '@/store/AppContext';
import type { AppState } from '@/store/AppContext';

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    fbReady: true,
    userRole: null,
    allUserRoles: {},
    curView: 'all',
    curYear: 2025,
    curPart: '1',
    curGrade: '1',
    curClass: '1',
    classData: {},
    attData: {},
    customEventsData: {},
    dataRevision: 0,
    dataLoaded: { classes: false, attendance: false, events: false },
    dataErrors: { classes: null, attendance: null, events: null },
    months: [
      { month: 1, sundays: [5, 12, 19, 26] },
      { month: 2, sundays: [2, 9, 16, 23] },
    ],
    holidayRanges: {},
    events: {},
    saveStatus: 'idle',
    lastAttendanceSavedAt: null,
    attModal: { open: false, target: null },
    studentModal: { open: false, editId: null },
    teacherModal: { open: false },
    accountModal: { open: false, editKey: null },
    rosterModal: false,
    moveModal: { open: false, target: null },
    addClassModal: false,
    historyModal: { open: false, sid: null, ck: null },
    ...overrides,
  };
}

describe('calcStats', () => {
  it('returns zeros when no attendance data exists', () => {
    const state = makeState();
    const result = calcStats(state, '1-1-1', 'S11_01');
    expect(result.total).toBeGreaterThan(0);
    expect(result.present).toBe(0);
    expect(result.absent).toBe(0);
    expect(result.rate).toBe(0);
  });

  it('이전 지각 값을 출석으로 합쳐 계산한다', () => {
    const state = makeState({
      attData: ({
        '1-1-1': {
          'S11_01': {
            '0-0': 'O',
            '0-1': 'O',
            '0-2': 'X',
            '0-3': 'T',
          },
        },
      }) as unknown as AppState['attData'],
    });
    const result = calcStats(state, '1-1-1', 'S11_01');
    expect(result.present).toBe(3);
    expect(result.absent).toBe(1);
    expect(result.rate).toBe(75); // 이전 T를 O로 보아 3 / 4 = 75%
  });

  it('excludes events from calculations', () => {
    const state = makeState({
      events: { '0-0': '설연휴' },
      attData: {
        '1-1-1': {
          'S11_01': {
            '0-0': 'O', // should be excluded
            '0-1': 'O',
            '0-2': 'X',
          },
        },
      },
    });
    const result = calcStats(state, '1-1-1', 'S11_01');
    expect(result.present).toBe(1);
    expect(result.absent).toBe(1);
    expect(result.rate).toBe(50);
  });

  it('filters by first semester when curView is "first"', () => {
    const state = makeState({
      curView: 'first',
      months: [
        { month: 1, sundays: [5, 12] },
        { month: 7, sundays: [6, 13] },
      ],
      attData: {
        '1-1-1': {
          'S11_01': {
            '0-0': 'O',
            '0-1': 'X',
            '1-0': 'O', // July - should be excluded in first semester
            '1-1': 'O',
          },
        },
      },
    });
    const result = calcStats(state, '1-1-1', 'S11_01');
    expect(result.present).toBe(1);
    expect(result.absent).toBe(1);
    // total should be 2 (only January weeks)
    expect(result.total).toBe(2);
  });

  it('filters by second semester when curView is "second"', () => {
    const state = makeState({
      curView: 'second',
      months: [
        { month: 3, sundays: [2, 9] },
        { month: 9, sundays: [7, 14] },
      ],
      attData: {
        '1-1-1': {
          'S11_01': {
            '0-0': 'O',
            '0-1': 'O',
            '1-0': 'X',
            '1-1': 'O',
          },
        },
      },
    });
    const result = calcStats(state, '1-1-1', 'S11_01');
    expect(result.present).toBe(1);
    expect(result.absent).toBe(1);
    expect(result.total).toBe(2);
  });

  it('handles empty attendance data for a student', () => {
    const state = makeState({
      attData: {
        '1-1-1': {},
      },
    });
    const result = calcStats(state, '1-1-1', 'S11_01');
    expect(result.present).toBe(0);
    expect(result.absent).toBe(0);
    expect(result.rate).toBe(0);
  });

  it('handles missing class key in attData', () => {
    const state = makeState({
      attData: {},
    });
    const result = calcStats(state, '2-3-4', 'S23_01');
    expect(result.present).toBe(0);
    expect(result.rate).toBe(0);
  });

  it('calculates 100% rate for perfect attendance', () => {
    const state = makeState({
      months: [{ month: 1, sundays: [5, 12, 19] }],
      attData: {
        '1-1-1': {
          'S11_01': {
            '0-0': 'O',
            '0-1': 'O',
            '0-2': 'O',
          },
        },
      },
    });
    const result = calcStats(state, '1-1-1', 'S11_01');
    expect(result.rate).toBe(100);
    expect(result.present).toBe(3);
    expect(result.absent).toBe(0);
  });

  it('ignores empty string values (not yet entered)', () => {
    const state = makeState({
      months: [{ month: 1, sundays: [5, 12] }],
      attData: {
        '1-1-1': {
          'S11_01': {
            '0-0': 'O',
            '0-1': '',
          },
        },
      },
    });
    const result = calcStats(state, '1-1-1', 'S11_01');
    expect(result.present).toBe(1);
    expect(result.absent).toBe(0);
    // rate should be based on recorded entries only
    expect(result.rate).toBe(100);
  });
});
