/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initialState, type AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ state: null as AppState | null, download: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state, getState: () => m.state }) }));
vi.mock('@/utils/export', () => ({ downloadXLSX: m.download }));
import YouthHandoffSection from './YouthHandoffSection';
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T00:00:00+09:00')); m.download.mockReset().mockResolvedValue(undefined);
  m.state = { ...initialState, userRole: { role: 'admin' }, curYear: 2026, fbReady: true, dataLoaded: { classes: true, attendance: true, events: true },
    classData: { '1-3-1': { students: [{ id: 'a', name: '가상 고3' }] }, '2-3-1': { students: [{ id: 'a', name: '가상 장결', jang: true }] } },
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('공백이 있는 점 구분 생년월일을 미리보기와 내려받기에서 같은 날짜로 표시한다', async () => {
  m.state!.classData = { '1-3-1': { students: [{ id: 'a', name: '가상 고3', birth: '2008. 01. 31', phone: '010-0000-0001', pphone: '010-0000-0002', school: '가상고', addr: '가상 주소' }] } };
  render(<YouthHandoffSection />);
  expect(screen.getByText('2008-01-31')).toBeTruthy();
  expect(screen.queryByText('확인 필요 (2008. 01. 31)')).toBeNull();
  expect(screen.getByText(/기본 정보 확인 필요 0명/)).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '전체 고3 엑셀 내려받기' })); });
  expect(m.download.mock.calls[0][0][6][1]).toEqual(new Date(2008, 0, 31));
  expect(m.state!.classData['1-3-1'].students[0].birth).toBe('2008. 01. 31');
});
it('미리보기에서 전체 고3를 확인하고 8개 항목 엑셀을 내려받는다', async () => {
  render(<YouthHandoffSection />);
  expect(screen.getByText('가상 장결')).toBeTruthy();
  expect(screen.getAllByRole('columnheader', { hidden: true })).toHaveLength(8);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '전체 고3 엑셀 내려받기' })); });
  expect(m.download).toHaveBeenCalledOnce();
  const [rows, sheet, filename, options] = m.download.mock.calls[0];
  expect(rows.slice(6)).toHaveLength(2); expect(sheet).toBe('청년부 인계');
  expect(filename).toBe('청년부인계_고3_2026_2026-11-01.xlsx');
  expect(options).toMatchObject({ headerRow: 5, columnFormats: { 1: 'yyyy-mm-dd', 6: '0%' } });
  expect(options.beforeDownload()).toBeUndefined();
});
it.each(['classes', 'attendance', 'events'] as const)('%s 원장이 준비되지 않으면 빈 명단으로 내려받지 않는다', key => {
  m.state!.dataLoaded = { ...m.state!.dataLoaded, [key]: false };
  render(<YouthHandoffSection />);
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('모두 불러온 뒤'); expect(m.download).not.toHaveBeenCalled();
});
it('교사에게 기능을 노출하지 않는다', () => {
  m.state!.userRole = { role: 'teacher' }; render(<YouthHandoffSection />); expect(screen.queryByRole('button')).toBeNull();
});
it('고3가 없거나 미래 연도이면 내려받기를 막고 이유를 표시한다', () => {
  m.state!.classData = {}; const view = render(<YouthHandoffSection />);
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('선택한 연도에 등록된 고3 학생이 없습니다.')).toBeTruthy();
  m.state = { ...m.state!, curYear: 2027 }; view.rerender(<YouthHandoffSection />);
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true); expect(screen.getByRole('status').textContent).toContain('아직 시작되지 않은 연도');
});
it('다운로드 실패를 숨기지 않고 다시 시도할 수 있다', async () => {
  m.download.mockRejectedValueOnce(new Error('엑셀 생성 실패'));
  render(<YouthHandoffSection />); await act(async () => { fireEvent.click(screen.getByRole('button')); });
  expect(screen.getByRole('alert').textContent).toBe('엑셀 생성 실패');
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
  await act(async () => { fireEvent.click(screen.getByRole('button')); }); expect(m.download).toHaveBeenCalledTimes(2);
});
it('라이브러리 로딩 중 계정·연도가 바뀌면 이전 명단 파일을 만들지 않는다', async () => {
  m.download.mockImplementation(async (_rows, _sheet, _name, options) => { m.state = { ...m.state!, dataRevision: 1, curYear: 2027 }; options.beforeDownload(); });
  render(<YouthHandoffSection />); await act(async () => { fireEvent.click(screen.getByRole('button')); });
  expect(screen.getByRole('alert').textContent).toContain('조회 연도나 로그인 상태가 변경');
});
it('연속 클릭으로 같은 파일을 여러 번 만들지 않는다', async () => {
  m.download.mockImplementation(() => new Promise(() => {})); render(<YouthHandoffSection />);
  const button = screen.getByRole('button'); fireEvent.click(button); fireEvent.click(button);
  expect(m.download).toHaveBeenCalledOnce(); expect(button.hasAttribute('disabled')).toBe(true);
});
