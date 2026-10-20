/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import { buildPastoralReport } from '@/utils/pastoralReport';
const m = vi.hoisted(() => ({ state: {} as typeof initialState, download: vi.fn(), user: {} as { email: string }, demo: false }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state, getState: () => m.state }) }));
vi.mock('@/lib/firebase/client', () => ({ auth: { get currentUser() { return m.user; } } }));
vi.mock('@/lib/demo', () => ({ isDemoAccount: () => m.demo }));
vi.mock('@/utils/export', () => ({ downloadXLSX: m.download }));
import PastoralContactExport from './PastoralContactExport';
function report() { return buildPastoralReport(m.state, [], Date.parse('2026-02-01T00:00:00+09:00'), '0-3'); }
beforeEach(() => {
  m.demo = false; m.user = { email: 'synthetic@example.test' }; m.download.mockReset().mockResolvedValue(undefined);
  m.state = { ...initialState, curYear: 2026, userRole: { role: 'admin' }, fbReady: true, dataLoaded: { classes: true, attendance: true, events: true },
    months: [{ month: 1, sundays: [4, 11, 18, 25] }], events: {},
    classData: { '1-1-1': { students: [{ id: 'a', name: '결석 학생', phone: '01000000001' }, { id: 'b', name: '복귀 학생', phone: '01000000002' }] } },
    attData: { '1-1-1': { a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' }, b: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'O' } } },
  };
});
afterEach(cleanup);
it.each(['연속 결석', '다시 출석'])('%s 전체 연락처를 별도 파일로 내려받는다', async label => {
  render(<PastoralContactExport report={report()} order="absence" />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: `${label} 전체 연락처 엑셀 내려받기` })));
  expect(m.download).toHaveBeenCalledOnce();
  const [rows, sheet, filename, options] = m.download.mock.calls[0];
  expect(sheet).toBe(label); expect(rows.slice(6)).toHaveLength(1); expect(filename).toBe(`${label.replace(/ /g, '')}_전체연락처_2026-01-25.xlsx`);
  expect(options).toMatchObject({ headerRow: 5, columnWidths: [20, 24, 24, 24, 12, 24, 20], columnFormats: { 6: 'yyyy-mm-dd' } }); expect(options.beforeDownload()).toBeUndefined();
  expect(screen.getByRole('status').textContent).toContain('전체 1명');
});
it('자료 미준비 또는 대상이 없으면 파일을 만들지 않는다', () => {
  m.state.dataLoaded.attendance = false;
  const view = render(<PastoralContactExport report={report()} order="absence" />);
  expect(screen.getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true);
  m.state = { ...m.state, dataLoaded: { classes: true, attendance: true, events: true }, attData: {} };
  view.rerender(<PastoralContactExport report={report()} order="absence" />);
  expect(screen.getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true); expect(m.download).not.toHaveBeenCalled();
});
it.each(['teacher', 'demo'])('%s에게 연락처 내보내기를 제공하지 않는다', mode => {
  if (mode === 'teacher') m.state.userRole = { role: 'teacher' }; else m.demo = true;
  render(<PastoralContactExport report={report()} order="absence" />); expect(screen.queryByRole('button')).toBeNull();
});
it('실패를 표시하고 재시도하며 중복 클릭은 차단한다', async () => {
  m.download.mockRejectedValueOnce(new Error('엑셀 생성 실패')); render(<PastoralContactExport report={report()} order="absence" />);
  const button = screen.getByRole('button', { name: '연속 결석 전체 연락처 엑셀 내려받기' });
  await act(async () => fireEvent.click(button)); expect(screen.getByRole('alert').textContent).toBe('엑셀 생성 실패');
  m.download.mockImplementation(() => new Promise(() => {})); fireEvent.click(button); fireEvent.click(button);
  expect(m.download).toHaveBeenCalledTimes(2); expect(screen.getAllByRole('button').every(element => element.hasAttribute('disabled'))).toBe(true);
});
it.each(['year', 'revision', 'user', 'role', 'ready'])('엑셀 로딩 중 %s가 바뀌면 이전 파일을 만들지 않는다', async change => {
  let blocked = false;
  m.download.mockImplementation(async (_rows, _sheet, _name, options) => {
    if (change === 'year') m.state = { ...m.state, curYear: 2025 };
    if (change === 'revision') m.state = { ...m.state, dataRevision: 1 };
    if (change === 'user') m.user = { email: 'other@example.test' };
    if (change === 'role') m.state = { ...m.state, userRole: { role: 'teacher' } };
    if (change === 'ready') m.state = { ...m.state, dataLoaded: { ...m.state.dataLoaded, classes: false } };
    try { options.beforeDownload(); } catch (error) { blocked = true; throw error; }
  });
  render(<PastoralContactExport report={report()} order="absence" />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '연속 결석 전체 연락처 엑셀 내려받기' })));
  expect(blocked).toBe(true);
  if (change === 'role') expect(screen.queryByRole('button')).toBeNull();
  else expect(screen.getByRole('alert').textContent).toContain('로그인 상태가 변경');
});
it('주일 변경과 화면 이탈 후 파일 생성을 취소한다', async () => {
  let beforeDownload = () => {}; let finish = () => {};
  m.download.mockImplementation((_rows, _sheet, _name, options) => new Promise<void>(resolve => { beforeDownload = options.beforeDownload; finish = resolve; }));
  const data = report(); const view = render(<PastoralContactExport report={data} order="absence" />);
  fireEvent.click(screen.getByRole('button', { name: '연속 결석 전체 연락처 엑셀 내려받기' }));
  view.rerender(<PastoralContactExport report={{ ...data, selectedWeek: data.weeks[1] }} order="absence" />);
  expect(beforeDownload).toThrow('조회 주일'); view.unmount(); expect(beforeDownload).toThrow('조회 주일'); await act(async () => finish());
});
