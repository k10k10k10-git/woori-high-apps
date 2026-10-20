/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';

const m = vi.hoisted(() => ({ state: {} as typeof initialState, download: vi.fn(), user: null as { uid: string; email: string } | null, demo: false }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state, getState: () => m.state }) }));
vi.mock('@/lib/firebase/client', () => ({ auth: { get currentUser() { return m.user; } } }));
vi.mock('@/lib/demo', () => ({ isDemoAccount: () => m.demo }));
vi.mock('@/utils/fileExport', async original => ({ ...await original<typeof import('@/utils/fileExport')>(), downloadFileWorkbook: m.download }));
import FileExportTab from './FileExportTab';

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-02-01T00:00:00+09:00'));
  m.demo = false; m.user = { uid: 'synthetic-admin', email: 'synthetic@example.test' };
  m.download.mockReset().mockImplementation(async (_file, beforeDownload) => beforeDownload());
  m.state = { ...initialState, curYear: 2026, userRole: { role: 'admin' }, fbReady: true, dataLoaded: { classes: true, attendance: true, events: true },
    months: [{ month: 1, sundays: [4, 11, 18, 25] }], events: {},
    classData: {
      '1-1-1': { teacher: '합성 담임', students: [{ id: 'a', name: '합성 결석', phone: '01000000001', pphone: '01000000011' }, { id: 'b', name: '합성 복귀', phone: '01000000002', pphone: '01000000012' }] },
      '2-3-9': { students: [{ id: 'c', name: '합성 장결', jang: true }] },
    },
    attData: { '1-1-1': { a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' }, b: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'O' } } },
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('1부·2부 전체 학생을 장결 포함한 별도 파일로 내려받는다', async () => {
  render(<FileExportTab />);
  expect(screen.getByRole('button', { name: '전체 명단' }).getAttribute('aria-pressed')).toBe('true');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '1부 전체 명단 엑셀 내려받기' })));
  expect(m.download.mock.calls[0][0]).toMatchObject({ label: '1부 전체 명단', count: 2 });
  expect(m.download.mock.calls[0][0].sheets.map((sheet: { name: string }) => sheet.name)).toEqual(['반별 요약', '학생 명단', '전체 학생·연간 출석', '1학년 1반']);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '2부 전체 명단 엑셀 내려받기' })));
  expect(m.download.mock.calls[1][0]).toMatchObject({ label: '2부 전체 명단', count: 1 });
  expect(screen.getByRole('status').textContent).toContain('2부 전체 명단 1명');
});

it('부서·학년을 바꾸면 존재하는 반으로 파생하고 선택한 반만 내보낸다', async () => {
  render(<FileExportTab />);
  fireEvent.click(screen.getByRole('button', { name: '반별 출석부' }));
  fireEvent.change(screen.getByRole('combobox', { name: '부서' }), { target: { value: '2' } });
  expect((screen.getByRole('combobox', { name: '학년' }) as HTMLSelectElement).value).toBe('3');
  expect((screen.getByRole('combobox', { name: '반' }) as HTMLSelectElement).value).toBe('2-3-9');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '선택한 반 출석부 엑셀 내려받기' })));
  expect(m.download.mock.calls[0][0]).toMatchObject({ label: '2부 3학년 9반 출석부', count: 1 });
});

it.each([['연속 결석 명단', '합성 결석'], ['다시 출석 명단', '합성 복귀']])('%s는 기준 주일 전체 대상과 본인·보호자 연락처를 내보낸다', async (label, student) => {
  render(<FileExportTab />);
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.change(screen.getByRole('combobox', { name: '정렬' }), { target: { value: 'latest' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: `${label} 엑셀 내려받기` })));
  const file = m.download.mock.calls[0][0];
  expect(file.count).toBe(1);
  expect(file.sheets[0].rows[5]).toContain('보호자 연락처');
  expect(file.sheets[0].rows[6][0]).toBe(student);
});

it.each(['teacher', 'demo', 'signed-out'])('%s에게 파일화 기능을 열지 않는다', mode => {
  if (mode === 'teacher') m.state.userRole = { role: 'teacher' };
  if (mode === 'demo') m.demo = true;
  if (mode === 'signed-out') m.user = null;
  render(<FileExportTab />);
  expect(screen.queryByRole('button')).toBeNull();
});

it.each(['classes', 'attendance', 'events'] as const)('%s 미준비이면 이전 명단으로 내려받지 않는다', key => {
  m.state = { ...m.state, dataLoaded: { ...m.state.dataLoaded, [key]: false } };
  render(<FileExportTab />);
  expect(screen.getByRole('button', { name: '1부 전체 명단 엑셀 내려받기' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('모두 불러온 뒤');
  expect(m.download).not.toHaveBeenCalled();
});

it('파일 생성 실패를 표시하고 재시도를 허용하며 연속 클릭은 막는다', async () => {
  m.download.mockRejectedValueOnce(new Error('합성 파일 생성 실패'));
  render(<FileExportTab />);
  const button = screen.getByRole('button', { name: '1부 전체 명단 엑셀 내려받기' });
  await act(async () => fireEvent.click(button));
  expect(screen.getByRole('alert').textContent).toBe('합성 파일 생성 실패');
  m.download.mockImplementation(() => new Promise(() => {}));
  fireEvent.click(button); fireEvent.click(button);
  expect(m.download).toHaveBeenCalledTimes(2);
  expect(button.hasAttribute('disabled')).toBe(true);
});

it.each(['year', 'revision', 'user', 'role', 'ready'])('비동기 파일 생성 중 %s 변경 시 내려받기를 차단한다', async change => {
  m.download.mockImplementation(async (_file, beforeDownload) => {
    if (change === 'year') m.state = { ...m.state, curYear: 2025 };
    if (change === 'revision') m.state = { ...m.state, dataRevision: m.state.dataRevision + 1 };
    if (change === 'user') m.user = { uid: 'other-admin', email: 'other@example.test' };
    if (change === 'role') m.state = { ...m.state, userRole: { role: 'teacher' } };
    if (change === 'ready') m.state = { ...m.state, dataLoaded: { ...m.state.dataLoaded, attendance: false } };
    beforeDownload();
  });
  render(<FileExportTab />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '1부 전체 명단 엑셀 내려받기' })));
  if (change === 'role') expect(screen.queryByRole('button')).toBeNull();
  else expect(screen.getByRole('alert').textContent).toContain('로그인 상태가 변경');
});

it('파일 종류·기준 주일 변경과 화면 이탈 후 이전 파일을 내려받지 않는다', async () => {
  let assertScope = () => {};
  let finish = () => {};
  m.download.mockImplementation((_file, beforeDownload) => new Promise<void>(resolve => { assertScope = beforeDownload; finish = resolve; }));
  const view = render(<FileExportTab />);
  fireEvent.click(screen.getByRole('button', { name: '연속 결석 명단' }));
  fireEvent.click(screen.getByRole('button', { name: '연속 결석 명단 엑셀 내려받기' }));
  expect(assertScope()).toBeUndefined();
  fireEvent.change(screen.getByRole('combobox', { name: '기준 주일' }), { target: { value: '0-2' } });
  expect(assertScope).toThrow('조회 조건');
  fireEvent.click(screen.getByRole('button', { name: '다시 출석 명단' }));
  expect(assertScope).toThrow('파일 종류');
  view.unmount();
  expect(assertScope).toThrow('로그인 상태');
  await act(async () => finish());
});

it('등록 학생이 없으면 빈 파일 대신 이유를 표시한다', () => {
  m.state = { ...m.state, classData: {}, attData: {} };
  render(<FileExportTab />);
  expect(screen.getByRole('button', { name: '1부 전체 명단 엑셀 내려받기' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('1부에 등록된 학생이 없습니다.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '반별 출석부' }));
  expect(screen.getByRole('button', { name: '선택한 반 출석부 엑셀 내려받기' }).hasAttribute('disabled')).toBe(true);
});

it('미래 연도는 내려받기 대신 조회 연도 변경을 안내한다', () => {
  m.state = { ...m.state, curYear: 2027 };
  render(<FileExportTab />);
  expect(screen.getByRole('status').textContent).toContain('아직 시작되지 않은 연도');
  expect(screen.getByRole('button', { name: '1부 전체 명단 엑셀 내려받기' }).hasAttribute('disabled')).toBe(true);
  expect(m.download).not.toHaveBeenCalled();
});
