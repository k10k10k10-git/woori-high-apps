/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initialState, type AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ state: null as AppState | null, dispatch: vi.fn(), get: vi.fn<(path: string) => Promise<{ exists: () => boolean; val: () => null }>>(async () => ({ exists: () => false, val: () => null })), set: vi.fn(),
  managementData: {} as Record<string, unknown>, managementWrites: vi.fn(), toast: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state!, getState: () => m.state!, dispatch: m.dispatch }) }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path, get: m.get, set: m.set, update: vi.fn(), runTransaction: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { uid: 'settings-test-admin' } }, db: {} }));
vi.mock('@/utils/toast', () => ({ showToast: m.toast }));
vi.mock('@/lib/managementSave', () => {
  class ManagementSaveError extends Error { constructor(public kind: string, message: string) { super(message); } }
  return { ManagementSaveError, runManagementSave: async (isCurrent: () => boolean, task: (session: unknown) => Promise<unknown>) => {
    if (!isCurrent()) throw new ManagementSaveError('session', '현재 화면이 아닙니다.');
    return task({ check: () => {},
      read: async (path: string) => ({ value: structuredClone(m.managementData[path] ?? null), etag: 'etag' }),
      write: async (path: string, _etag: string, value: unknown) => { m.managementWrites(path, value); m.managementData[path] = structuredClone(value); },
    });
  } };
});
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); };
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => location.search)),
    useRouter: () => ({ replace: (href: string) => { history.replaceState(null, '', href); window.dispatchEvent(new PopStateEvent('popstate')); } }),
  };
});
vi.mock('next/dynamic', () => ({ default: () => () => <div>교사 명단 합성 화면</div> }));
import AdminTab from './AdminTab';
import { clearAdminViewState } from '@/hooks/useAdminViewState';
beforeEach(() => {
  m.state = { ...initialState, curYear: 2026, userRole: { role: 'admin' }, dataLoaded: { classes: true, attendance: true, events: true } };
  clearAdminViewState();
  history.replaceState(null, '', '/admin');
  vi.clearAllMocks();
  m.managementData = {};
  m.set.mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
it('설정을 계정·교사·행사·데이터로 구분하고 교사 화면은 선택할 때만 연다', async () => {
  render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['계정 관리', '교사 명단', '출석 제외 일정', '데이터 관리']);
  expect(screen.queryByText('교사 명단 합성 화면')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '교사 명단' }));
  expect(screen.getByText('교사 명단 합성 화면')).toBeTruthy();
  expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(screen.getByRole('tab', { name: '교사 명단' }).id);
  fireEvent.keyDown(screen.getByRole('tab', { name: '교사 명단' }), { key: 'ArrowRight' });
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: '출석 제외 일정' }));
  expect(screen.getByRole('tab', { name: '출석 제외 일정' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByText('교사 명단 합성 화면')).toBeNull();
});
it('청년부 인계는 데이터 관리에서 열고 계정 화면에는 노출하지 않는다', async () => {
  render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  expect(screen.queryByRole('button', { name: '전체 고3 엑셀 내려받기' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '데이터 관리' }));
  expect(screen.getByRole('button', { name: '전체 고3 엑셀 내려받기' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('heading', { name: /청년부 인계/ })).toBeTruthy();
});
it('시트 동기화 화면·주소 조회·쓰기는 없고 청년부 인계·진급은 유지한다', async () => {
  m.get.mockClear(); m.set.mockClear();
  const { container } = render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  for (const name of ['데이터 관리', '출석 제외 일정', '교사 명단', '계정 관리', '데이터 관리']) {
    fireEvent.click(screen.getByRole('tab', { name }));
    expect(container.textContent).not.toMatch(/구글 시트|동기화 미리보기|동기화 적용|시트 주소/);
  }
  expect(m.get.mock.calls.map(call => call[0])).toEqual(['userRoles']);
  expect(m.set).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '전체 고3 엑셀 내려받기' })).toBeTruthy();
  expect(screen.getByText('새해 진급 처리')).toBeTruthy();
});

it('선택한 설정 탭을 재진입·새로고침에 복원하고 직접 링크와 뒤로가기를 따른다', async () => {
  const view = render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  fireEvent.click(screen.getByRole('tab', { name: '출석 제외 일정' }));
  expect(location.search).toBe('?section=events');
  view.unmount();
  history.replaceState(null, '', '/admin');
  const restored = render(<AdminTab />);
  await waitFor(() => expect(screen.getByRole('tab', { name: '출석 제외 일정' }).getAttribute('aria-selected')).toBe('true'));
  restored.unmount();
  history.replaceState(null, '', '/admin?section=data');
  render(<AdminTab />);
  await act(async () => {});
  expect(screen.getByRole('tab', { name: '데이터 관리' }).getAttribute('aria-selected')).toBe('true');
  act(() => { history.replaceState(null, '', '/admin?section=teachers'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(screen.getByRole('tab', { name: '교사 명단' }).getAttribute('aria-selected')).toBe('true');
});

function eventForm() {
  fireEvent.click(screen.getByRole('tab', { name: '출석 제외 일정' }));
  const date = screen.getByLabelText('날짜') as HTMLInputElement;
  const label = screen.getByLabelText('일정 이름') as HTMLInputElement;
  return { date, label, form: date.closest('form')!, button: screen.getByRole('button', { name: '일정 추가' }) };
}

it('다른 연도·일요일 아닌 날짜는 저장하지 않고 제외되는 주일을 미리 보여준다', async () => {
  render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  const { date, label, form, button } = eventForm();
  expect(date.type).toBe('date');
  expect(date.min).toBe('2026-01-01'); expect(date.max).toBe('2026-12-31');
  fireEvent.change(label, { target: { value: '여름 수련회' } });
  for (const value of ['2025-08-17', '2026-08-15']) {
    fireEvent.change(date, { target: { value } });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.submit(form);
    expect(m.set).not.toHaveBeenCalled();
  }
  expect(screen.getByRole('alert').textContent).toMatch(/일요일을 선택/);
  fireEvent.change(date, { target: { value: '2026-08-16' } });
  expect(button.hasAttribute('disabled')).toBe(false);
  expect(screen.getByText('8월 16일(일) 주일 선택 목록과 출석 집계에서 제외됩니다.')).toBeTruthy();
});

it('중복 추가를 막고 기존 DB 형태로 저장한 뒤 확정된 접수만 알린다', async () => {
  let resolve!: () => void;
  m.set.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
  render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  const { date, label, form } = eventForm();
  fireEvent.change(date, { target: { value: '2026-08-16' } });
  fireEvent.change(label, { target: { value: ' 여름 수련회 ' } });
  fireEvent.submit(form); fireEvent.submit(form);
  expect(m.set).toHaveBeenCalledTimes(1);
  expect(m.set.mock.calls[0]).toEqual([expect.stringMatching(/^events\/2026\/ev_\d+$/), { month: '8', day: '16', label: '여름 수련회' }]);
  expect(screen.getByRole('button', { name: '추가 중…' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText(/일정이 추가되었습니다/)).toBeNull();
  await act(async () => { resolve(); });
  expect(screen.getByText('8월 16일 출석 제외 일정이 추가되었습니다.')).toBeTruthy();
  expect(date.value).toBe(''); expect(label.value).toBe('');
});

it('추가 실패 시 날짜·이름을 보존하고 세대가 바뀐 완료로 새 초안을 지우지 않는다', async () => {
  m.set.mockRejectedValueOnce(new Error('permission_denied'));
  const view = render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  const { date, label, form } = eventForm();
  fireEvent.change(date, { target: { value: '2026-08-16' } });
  fireEvent.change(label, { target: { value: '여름 수련회' } });
  fireEvent.submit(form);
  await screen.findByText(/일정을 저장하지 못했습니다/);
  expect(date.value).toBe('2026-08-16'); expect(label.value).toBe('여름 수련회');
  let resolve!: () => void;
  m.set.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
  fireEvent.submit(form);
  m.state = { ...m.state!, curYear: 2027, dataRevision: 1 };
  view.rerender(<AdminTab />);
  await act(async () => { resolve(); });
  expect(screen.queryByText(/일정이 추가되었습니다/)).toBeNull();
  expect(date.value).toBe(''); expect(label.value).toBe('');
});

it('원장 미준비·현재 연도·역할 변경 직후에는 렌더 전 폼 제출도 쓰지 않는다', async () => {
  render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  const { date, label, form } = eventForm();
  fireEvent.change(date, { target: { value: '2026-08-16' } });
  fireEvent.change(label, { target: { value: '여름 수련회' } });
  const ready = m.state!;
  for (const changed of [
    { ...ready, dataLoaded: { ...ready.dataLoaded, events: false } },
    { ...ready, curYear: 2027 },
    { ...ready, dataRevision: ready.dataRevision + 1 },
    { ...ready, draftSession: ready.draftSession + 1 },
    { ...ready, userRole: null },
  ]) {
    m.state = changed;
    fireEvent.submit(form);
    expect(m.set).not.toHaveBeenCalled();
  }
  await act(async () => {});
});

it('계정 수정은 폼 밖 필드와 동시 미수정 필드를 보존한다', async () => {
  const key = 'teacher_example_com';
  const role = { email: 'teacher@example.com', role: 'teacher' as const, part: '1', grade: '1', class: '1', name: '합성 교사', memo: '보존' };
  m.state = { ...m.state!, allUserRoles: { [key]: role } };
  m.managementData[`userRoles/${key}`] = { ...role, memo: '원격 변경' };
  render(<AdminTab />);
  fireEvent.click(await screen.findByRole('button', { name: 'teacher@example.com 계정 수정' }));
  fireEvent.change(screen.getByLabelText('반'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.managementWrites).toHaveBeenCalledWith(`userRoles/${key}`, expect.objectContaining({ class: '2', name: '합성 교사', memo: '원격 변경' })));
});

it('이미 등록된 이메일 키는 신규 등록으로 덮어쓰지 않는다', async () => {
  m.managementData['userRoles/teacher__at__example__dot__com'] = { email: 'teacher@example.com', role: 'teacher', name: '기존 계정' };
  render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  fireEvent.click(screen.getByRole('button', { name: /이메일 역할 등록/ }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/^이메일/), { target: { value: 'teacher@example.com' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('이미 등록된 이메일')));
  expect(m.managementWrites).not.toHaveBeenCalled();
});

it('계정을 연 뒤 다른 관리자가 변경했으면 삭제하지 않는다', async () => {
  const key = 'teacher_example_com';
  const role = { email: 'teacher@example.com', role: 'teacher' as const, part: '1', grade: '1', class: '1', name: '합성 교사' };
  m.state = { ...m.state!, allUserRoles: { [key]: role } };
  m.managementData[`userRoles/${key}`] = { ...role };
  render(<AdminTab />);
  fireEvent.click(await screen.findByRole('button', { name: 'teacher@example.com 계정 수정' }));
  m.managementData[`userRoles/${key}`] = { ...role, class: '2' };
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '계정 삭제' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '삭제 확인' }));
  await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('삭제하지 않았으니')));
  expect(m.managementWrites).not.toHaveBeenCalledWith(`userRoles/${key}`, null);
});
