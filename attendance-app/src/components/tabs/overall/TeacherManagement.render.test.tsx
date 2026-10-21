/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ state: {} as typeof initialState, dispatch: vi.fn(), data: {} as Record<string, unknown>, reads: vi.fn(), writes: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state, dispatch: m.dispatch, getState: () => m.state }) }));
vi.mock('@/components/modals/TeacherModal', () => ({ default: () => <div>반 원장 담임 수정</div> }));
vi.mock('@/lib/managementSave', () => {
  class ManagementSaveError extends Error { constructor(public kind: string, message: string) { super(message); } }
  return { ManagementSaveError, runManagementSave: async (_isCurrent: () => boolean, task: (session: unknown) => Promise<unknown>) => task({
    check: () => {},
    read: async (path: string) => { m.reads(path); return { value: structuredClone(m.data[path] ?? null), etag: 'etag' }; },
    write: async (path: string, _etag: string, value: unknown) => { m.writes(path, value); m.data[path] = structuredClone(value); },
  }) };
});
vi.mock('@/lib/db', () => ({
  db: {}, ref: (_db: unknown, path: string) => path,
  get: async (path: string) => ({ exists: () => m.data[path] != null, val: () => structuredClone(m.data[path]) }),
  set: vi.fn(),
  runTransaction: async (path: string, transform: (current: unknown) => unknown) => {
    const value = transform(structuredClone(m.data[path] ?? null));
    if (value === undefined) return { committed: false };
    m.writes(path, value); m.data[path] = value;
    return { committed: true, snapshot: { val: () => value } };
  },
}));
import TeacherManagement from './TeacherManagement';
beforeEach(() => {
  m.dispatch.mockClear(); m.reads.mockClear(); m.writes.mockClear();
  m.state = { ...initialState, curYear: 2026, userRole: { role: 'admin' }, classData: { '1-2-7': { teacher: '현재 담임', students: [] } } };
  const special = [{ title: '부장', name: '합성 부장', phone: 'old', personId: 'person_teacher_a' }, { title: '회계', name: '합성 회계', phone: 'other', personId: 'person_teacher_b' }];
  const extra = { name: '과거 담임', phone: 'extra-old', personId: 'person_teacher_c', memo: '보존' };
  const staff = { title: '음향', name: '합성 스탭', phone: 'staff-old', personId: 'person_staff_s', memo: '보존' };
  m.data = { 'teacherSpecial/2026/1': special, 'teacherSpecial/2026/1/0': special[0], 'teacherSpecial/2026/1/1': special[1],
    'teacherExtra/2026/1': { '1_2_7': extra }, 'teacherExtra/2026/1/1_2_7': extra,
    'teacherStaff/2026': { staff_a: staff }, 'teacherStaff/2026/staff_a': staff };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
it('특별 교사 한 명의 변경 필드만 저장하고 다른 교사와 원격 수정 필드를 보존한다', async () => {
  render(<TeacherManagement />);
  fireEvent.click(await screen.findByRole('button', { name: '부장 합성 부장 정보 수정' }));
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '새 부장' } });
  m.data['teacherSpecial/2026/1/0'] = { ...(m.data['teacherSpecial/2026/1/0'] as object), phone: 'remote-phone', memo: '원격 정보' };
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.writes).toHaveBeenCalledTimes(1));
  expect(m.writes).toHaveBeenCalledWith('teacherSpecial/2026/1/0', expect.objectContaining({ name: '새 부장', phone: 'remote-phone', memo: '원격 정보' }));
  expect(m.data['teacherSpecial/2026/1/1']).toMatchObject({ name: '합성 회계', phone: 'other' });
});
it('동일 필드가 원격 변경되면 저장을 중단하고 입력을 유지한다', async () => {
  render(<TeacherManagement />);
  fireEvent.click(await screen.findByRole('button', { name: '부장 합성 부장 정보 수정' }));
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '내 변경' } });
  m.data['teacherSpecial/2026/1/0'] = { ...(m.data['teacherSpecial/2026/1/0'] as object), name: '원격 변경' };
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('내 변경');
  expect(m.writes).not.toHaveBeenCalled();
});
it('담임 이름은 반 원장으로 표시하고 단일 이름·사진 수정 흐름으로 연결한다', async () => {
  render(<TeacherManagement />);
  fireEvent.click(await screen.findByRole('button', { name: '현재 담임 담임 정보 수정' }));
  const name = screen.getByLabelText('이름') as HTMLInputElement;
  expect(name.readOnly).toBe(true); expect(name.value).toBe('현재 담임');
  expect(screen.queryByText('과거 담임')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '담임 이름·사진 변경' }));
  expect(m.dispatch.mock.calls.map(call => call[0])).toEqual([
    { type: 'SET_PART', payload: '1' }, { type: 'SET_GRADE', payload: '2' }, { type: 'SET_CLASS', payload: '7' }, { type: 'OPEN_TEACHER_MODAL' },
  ]);
});
it('담임 추가정보 수정은 반 이름·학생 명단을 쓰지 않고 숨겨진 필드를 보존한다', async () => {
  render(<TeacherManagement />);
  fireEvent.click(await screen.findByRole('button', { name: '현재 담임 담임 정보 수정' }));
  fireEvent.change(screen.getByLabelText('전화번호'), { target: { value: 'extra-new' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.writes).toHaveBeenCalledTimes(1));
  expect(m.writes).toHaveBeenCalledWith('teacherExtra/2026/1/1_2_7', expect.objectContaining({ phone: 'extra-new', name: '과거 담임', memo: '보존', personId: 'person_teacher_c' }));
});

it('스탭은 수정한 필드만 최신 값에 병합하고 열린 뒤 변경된 항목은 삭제하지 않는다', async () => {
  render(<TeacherManagement />);
  fireEvent.click(screen.getByRole('button', { name: '스탭' }));
  fireEvent.click(await screen.findByRole('button', { name: '합성 스탭 스탭 정보 수정' }));
  fireEvent.change(screen.getByLabelText('전화번호'), { target: { value: 'staff-new' } });
  m.data['teacherStaff/2026/staff_a'] = { ...(m.data['teacherStaff/2026/staff_a'] as object), memo: '원격 변경' };
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.writes).toHaveBeenCalledWith('teacherStaff/2026/staff_a', expect.objectContaining({ phone: 'staff-new', memo: '원격 변경' })));

  fireEvent.click(screen.getByRole('button', { name: '합성 스탭 스탭 정보 수정' }));
  m.data['teacherStaff/2026/staff_a'] = { ...(m.data['teacherStaff/2026/staff_a'] as object), memo: '삭제 직전 원격 변경' };
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
  expect((await screen.findByRole('alert')).textContent).toContain('삭제하지 않았으니');
  expect(m.writes).not.toHaveBeenCalledWith('teacherStaff/2026/staff_a', null);
});

it('personId 탐색도 제한 저장 세션의 read로 수행한다', async () => {
  const withoutId = { title: '음향', name: '합성 스탭', phone: 'staff-old', memo: '보존' };
  m.data['teacherStaff/2026'] = { staff_a: withoutId };
  m.data['teacherStaff/2026/staff_a'] = withoutId;
  render(<TeacherManagement />);
  fireEvent.click(screen.getByRole('button', { name: '스탭' }));
  fireEvent.click(await screen.findByRole('button', { name: '합성 스탭 스탭 정보 수정' }));
  fireEvent.change(screen.getByLabelText('전화번호'), { target: { value: 'staff-new' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.writes).toHaveBeenCalled());
  expect(m.reads.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['teacherStaff/2026/staff_a', 'teacherStaff']));
});
