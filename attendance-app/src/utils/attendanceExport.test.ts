import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, type AppState } from '@/store/AppContext';
import { attendanceExport } from './attendanceExport';
import { utils, write, read } from 'xlsx';

const mocks = vi.hoisted(() => ({ downloadXLSX: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/export', async original => ({
  ...await original<typeof import('@/utils/export')>(),
  downloadXLSX: mocks.downloadXLSX,
}));

beforeEach(() => mocks.downloadXLSX.mockClear());

describe('출석부 Excel 요약', () => {
  it('선택 학기의 행사·미입력을 제외한 출석/주차·출석률·등급을 저장한다', async () => {
    const state: AppState = { ...initialState, curYear: 2026, curView: 'first',
      months: [{ month: 1, sundays: [4, 11, 18, 25] }, { month: 9, sundays: [6] }],
      events: { '0-1': '행사' },
      attData: { '1-1-1': { a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '1-0': 'O' } } },
    };
    const close = vi.fn();
    await attendanceExport(state, '1-1-1', [{ id: 'a', num: 1, name: '테스트 학생' }, { id: 'b', num: 2, name: '미입력 학생' }], ['0-0', '0-2', '0-3'], close).exportXLSX();
    const rows = [
      ['번호', '이름', '1/4', '1/18', '1/25', '출석/주차', '출석률', '등급'],
      ['1', '테스트 학생', 'O', 'X', '', '1/2', '50%', 'D'],
      ['2', '미입력 학생', '', '', '', '—', '—', '—'],
    ];
    expect(mocks.downloadXLSX).toHaveBeenCalledWith(rows, '출석', '출석_2026_1-1-1.xlsx');
    expect(close).toHaveBeenCalledOnce();
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), '출석');
    const restored = read(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    expect(utils.sheet_to_json(restored.Sheets['출석'], { header: 1 })).toEqual(rows);
  });

  it.each([[100, 'A'], [90, 'A'], [80, 'B'], [70, 'C'], [60, 'D']] as const)('%i%% 경계 등급은 화면과 같은 %s다', async (rate, grade) => {
    const records = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`0-${i}`, i < rate / 10 ? 'O' : 'X']));
    const state = { ...initialState, curView: 'second' as const,
      months: [{ month: 9, sundays: Array.from({ length: 10 }, (_, i) => i + 1) }],
      attData: { '1-1-1': { a: records } }, events: {},
    } as AppState;
    await attendanceExport(state, '1-1-1', [{ id: 'a', name: '테스트' }], Object.keys(records), vi.fn()).exportXLSX();
    expect(mocks.downloadXLSX.mock.calls[0][0][1].slice(-3)).toEqual([`${rate / 10}/10`, `${rate}%`, grade]);
  });

  it('이전 지각 기록도 기존 출석률처럼 출석으로 계산한다', async () => {
    const state = { ...initialState, curView: 'all', months: [{ month: 9, sundays: [6, 13] }], events: {},
      attData: { '1-1-1': { a: { '0-0': 'T', '0-1': 'X' } } },
    } as unknown as AppState;
    await attendanceExport(state, '1-1-1', [{ id: 'a', name: '테스트' }], ['0-0', '0-1'], vi.fn()).exportXLSX();
    expect(mocks.downloadXLSX.mock.calls[0][0][1].slice(-3)).toEqual(['1/2', '50%', 'D']);
  });
});
