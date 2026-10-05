import { beforeEach, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import { getSundaysForYear } from '@/utils/dates';
import { buildYouthHandoff, youthHandoffWorkbookRows } from './youthHandoff';
const m = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock('xlsx', async original => ({ ...await original<typeof import('xlsx')>(), writeFile: m.writeFile }));
import { read, write } from 'xlsx';
import { downloadXLSX } from './export';
beforeEach(() => m.writeFile.mockClear());
it('실제 XLSX 직렬화 후에도 날짜·연락처·퍼센트·필터와 8개 열이 보존된다', async () => {
  const source = { ...initialState, curYear: 2026, months: getSundaysForYear(2026), events: {},
    classData: { '1-3-1': { students: [{ id: 'a', name: '=가상학생', birth: '2008-02-29', phone: '01000000001', pphone: '01000000002', addr: '가상 주소' }] } },
    attData: { '1-3-1': { a: { '0-0': 'O' as const } } },
  };
  await downloadXLSX(youthHandoffWorkbookRows(buildYouthHandoff(source, Date.parse('2026-11-01T00:00:00+09:00'))), '청년부 인계', '합성.xlsx', {
    headerRow: 5, columnWidths: [18, 24, 22, 22, 24, 60, 14, 14], columnFormats: { 1: 'yyyy-mm-dd', 6: '0%' },
  });
  const workbook = m.writeFile.mock.calls[0][0];
  const restored = read(write(workbook, { type: 'buffer', bookType: 'xlsx' }), { cellNF: true, cellStyles: true });
  const sheet = restored.Sheets['청년부 인계'];
  expect(sheet['!ref']).toBe('A1:H7'); expect(sheet['!autofilter']?.ref).toBe('A6:H7');
  expect(sheet.A7).toMatchObject({ t: 's', v: '=가상학생' }); expect(sheet.A7.f).toBeUndefined();
  expect(sheet.B7).toMatchObject({ t: 'n', z: 'yyyy-mm-dd', w: '2008-02-29' });
  expect(sheet.C7).toMatchObject({ t: 's', v: '01000000001' }); expect(sheet.D7).toMatchObject({ t: 's', v: '01000000002' });
  expect(sheet.G7).toMatchObject({ t: 'n', v: 1, z: '0%', w: '100%' }); expect(sheet.H7.v).toBe('A');
  expect(sheet['!cols']?.[5].wch).toBeGreaterThanOrEqual(59);
});
it('상태 확인이 실패하면 writeFile을 호출하지 않는다', async () => {
  await expect(downloadXLSX([['이름'], ['가상']], '명단', '합성.xlsx', { beforeDownload: () => { throw new Error('연도 변경'); } })).rejects.toThrow('연도 변경');
  expect(m.writeFile).not.toHaveBeenCalled();
});
it('기존 3인자 내보내기는 원래 문자열 값·시트·파일명을 유지한다', async () => {
  await downloadXLSX([['출석률'], ['88%']], '출석', '출석.xlsx');
  expect(m.writeFile.mock.calls[0][0].Sheets['출석'].A2).toMatchObject({ t: 's', v: '88%' });
  expect(m.writeFile.mock.calls[0][1]).toBe('출석.xlsx');
});
