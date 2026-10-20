/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
import type { StudentMovePatchResult } from '@/utils/studentMoveRequest';
import type { Student } from '@/types';

const m = vi.hoisted(() => ({
  state: null as unknown,
  lock: null as unknown,
  source: null as unknown,
  dispatch: vi.fn(),
  token: vi.fn(),
  read: vi.fn(),
  patch: vi.fn(),
  transact: vi.fn(),
  disconnectUpdate: vi.fn(),
  disconnectCancel: vi.fn(),
  toast: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@/store/AppContext', async original => ({
  ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: m.state as AppState, getState: () => m.state as AppState, dispatch: m.dispatch }),
}));
vi.mock('@/lib/firebase/client', () => ({
  auth: { currentUser: { uid: 'synthetic-admin', getIdToken: m.token } },
}));
vi.mock('@/utils/toast', () => ({ showToast: m.toast }));
vi.mock('@/lib/db', () => ({
  db: {},
  ref: (_db: unknown, path: string) => path,
  push: () => ({ key: 'synthetic-destination' }),
  onValue: (path: string, callback: (snapshot: { val: () => unknown }) => void) => {
    callback({ val: () => path === '.info/connected' ? true : 0 });
    return () => {};
  },
  onDisconnect: (path: string) => ({
    update: (value: unknown) => m.disconnectUpdate(path, value),
    cancel: () => m.disconnectCancel(path),
  }),
}));
vi.mock('@/utils/studentMoveLockRequest', () => ({
  createStudentMoveLockTransaction: (input: { timeoutMs?: number }) =>
    (change: (current: unknown) => unknown) => m.transact(change, input),
}));
vi.mock('@/utils/studentMoveRequest', async original => ({
  ...await original<typeof import('@/utils/studentMoveRequest')>(),
  readStudentMoveValue: m.read,
  patchStudentMoveOnce: m.patch,
}));

import { initialState } from '@/store/AppContext';
import MoveStudentModal from './MoveStudentModal';

const source: Student = { id: 'same-sid', name: '합성 학생', personId: 'person_student_A', birth: '2008-01-01' };
const target = { fromCk: '1-3-1', sid: source.id };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}
function reviewMove() {
  fireEvent.change(screen.getByRole('combobox', { name: '이동할 반' }), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: '이동 내용 확인' }));
}
function confirmMove() {
  fireEvent.click(screen.getByRole('button', { name: '이동 확정' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  m.lock = null;
  m.source = { ...source };
  m.state = {
    ...initialState,
    curYear: 2026, curPart: '1', curGrade: '3', curClass: '1', dataRevision: 7,
    userRole: { role: 'admin', name: '합성 관리자' },
    dataLoaded: { classes: true, attendance: true, events: true },
    classData: {
      '1-3-1': { teacher: '출발 담임', students: [{ ...source }] },
      '1-3-2': { teacher: '도착 담임', students: [] },
      '1-3-3': { teacher: '다른 반 담임', students: [] },
    },
    attData: { '1-3-1': { [source.id]: { '0-0': 'O' } } },
  };
  m.token.mockResolvedValue('synthetic-id-token');
  m.patch.mockResolvedValue({ status: 'committed' });
  m.disconnectUpdate.mockResolvedValue(undefined);
  m.disconnectCancel.mockResolvedValue(undefined);
  m.transact.mockImplementation(async (change: (current: unknown) => unknown) => {
    const next = change(m.lock);
    const committed = next !== undefined;
    if (committed) m.lock = next;
    return { committed, value: m.lock };
  });
  m.read.mockImplementation(async ({ path, isCurrent }: { path: string; isCurrent: () => boolean }) => {
    if (!isCurrent()) throw new Error('조회 상태가 변경되었습니다.');
    if (path === `classes/2026/1-3-1/students/${source.id}`) return m.source;
    if (path === 'classes/2026/1-3-2') return { teacher: '도착 담임', students: {} };
    if (path === `attendance/2026/1-3-1/${source.id}`) return { '0-0': 'O' };
    return null;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('확인한 원래 학생과 출석만 한 번 이동하고 목적지 반을 선택한다', async () => {
  render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove(); confirmMove();
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(m.patch).toHaveBeenCalledOnce();
  expect(m.patch.mock.calls[0][0].payload).toMatchObject({
    [`classes/2026/1-3-1/students/${source.id}`]: null,
    [`classes/2026/1-3-2/students/${source.id}`]: source,
    [`attendance/2026/1-3-1/${source.id}`]: null,
    [`attendance/2026/1-3-2/${source.id}`]: { '0-0': 'O' },
  });
  expect(m.dispatch).toHaveBeenCalledWith({ type: 'SET_CLASS', payload: '2' });
  expect(m.toast).toHaveBeenCalledWith(expect.any(String), 'success');
});

it('이동 내용을 확인한 뒤 같은 SID·이름의 다른 인물로 바뀌어도 그 학생을 이동하지 않는다', async () => {
  const view = render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove();
  const replacement = { ...source, personId: 'person_student_B' };
  const state = m.state as AppState;
  m.source = replacement;
  m.state = { ...state, classData: { ...state.classData, '1-3-1': { teacher: '출발 담임', students: [replacement] } } };
  view.rerender(<MoveStudentModal target={target} onClose={m.close} />);
  await act(async () => { confirmMove(); });
  expect(m.patch).not.toHaveBeenCalled();
  expect(m.dispatch).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});

it('화면에는 원래 학생이 남아 있어도 서버에서 같은 SID·이름의 다른 인물을 읽으면 원장을 바꾸지 않는다', async () => {
  render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove();
  const state = m.state as AppState;
  const before = structuredClone({ classes: state.classData, attendance: state.attData });
  const replacement = { ...source, personId: 'person_student_B' };
  m.source = replacement;
  await act(async () => { confirmMove(); });
  expect(m.read).toHaveBeenCalledWith(expect.objectContaining({ path: `classes/2026/1-3-1/students/${source.id}` }));
  expect(m.patch).not.toHaveBeenCalled();
  expect({ classes: state.classData, attendance: state.attData }).toEqual(before);
  expect(m.source).toEqual(replacement);
  expect(m.lock).toBeNull();
  expect(m.dispatch).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});

it.each([{ birth: '2008-02-02' }, { phone: '01099999999' }])('영구 ID 없는 학생의 서버 정보가 %j로 바뀌면 동명이인 이동을 차단한다', async change => {
  const legacy: Student = { id: source.id, name: source.name, birth: source.birth, phone: '01000000000' };
  const state = m.state as AppState;
  m.state = { ...state, classData: { ...state.classData, '1-3-1': { teacher: '출발 담임', students: [legacy] } } };
  m.source = legacy;
  render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove();
  const before = structuredClone({ classes: (m.state as AppState).classData, attendance: state.attData });
  m.source = { ...legacy, ...change };
  await act(async () => { confirmMove(); });
  expect(m.read).toHaveBeenCalledWith(expect.objectContaining({ path: `classes/2026/1-3-1/students/${source.id}` }));
  expect(m.patch).not.toHaveBeenCalled();
  expect({ classes: (m.state as AppState).classData, attendance: state.attData }).toEqual(before);
  expect(m.source).toEqual({ ...legacy, ...change });
  expect(m.lock).toBeNull();
  expect(m.dispatch).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});

it('인증 토큰 대기 중 화면이 해제되면 이동 PATCH와 다른 화면의 선택 변경을 시작하지 않는다', async () => {
  const token = deferred<string>();
  m.token.mockReturnValue(token.promise);
  const view = render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove(); confirmMove();
  expect(m.token).toHaveBeenCalledOnce();
  view.unmount();
  m.state = { ...m.state as AppState, curClass: '3' };
  await act(async () => { token.resolve('synthetic-id-token'); });
  expect(m.read).not.toHaveBeenCalled();
  expect(m.patch).not.toHaveBeenCalled();
  expect(m.dispatch).not.toHaveBeenCalled();
  expect(m.toast).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});

it('PATCH 전송 후 화면이 해제되면 늦은 성공 응답이 다른 화면의 반·알림·모달을 바꾸지 않는다', async () => {
  const result = deferred<StudentMovePatchResult>();
  m.patch.mockReturnValue(result.promise);
  const view = render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove(); confirmMove();
  await waitFor(() => expect(m.patch).toHaveBeenCalledOnce());
  view.unmount();
  m.state = { ...m.state as AppState, curClass: '3' };
  await act(async () => { result.resolve({ status: 'committed' }); });
  expect(m.patch).toHaveBeenCalledOnce();
  expect(m.dispatch).not.toHaveBeenCalled();
  expect(m.toast).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});

it('PATCH 결과가 불명확한 채 화면이 해제되면 pending 잠금을 보존하고 UI에는 반영하지 않는다', async () => {
  const result = deferred<StudentMovePatchResult>();
  m.patch.mockReturnValue(result.promise);
  const view = render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove(); confirmMove();
  await waitFor(() => expect(m.patch).toHaveBeenCalledOnce());
  const pending = structuredClone(m.lock) as Record<string, Record<string, Record<string, { phase: string }>>>;
  expect(Object.values(pending['1-3-1']['synthetic-admin'])).toEqual([expect.objectContaining({ phase: 'pending' })]);
  expect(Object.values(pending['1-3-2']['synthetic-admin'])).toEqual([expect.objectContaining({ phase: 'pending' })]);
  const transactionCount = m.transact.mock.calls.length;
  view.unmount();
  m.state = { ...m.state as AppState, curClass: '3' };
  await act(async () => { result.resolve({ status: 'unknown' }); });
  expect(m.lock).toEqual(pending);
  expect(m.transact).toHaveBeenCalledTimes(transactionCount);
  expect(m.patch).toHaveBeenCalledOnce();
  expect(m.dispatch).not.toHaveBeenCalled();
  expect(m.toast).not.toHaveBeenCalled();
  expect(m.close).not.toHaveBeenCalled();
});

it('연결 종료 등록이 멈추면 15초 뒤 취소를 열고 늦은 등록은 이전 작업 leaf만 취소한다', async () => {
  vi.useFakeTimers();
  const first = deferred<void>(), second = deferred<void>();
  m.disconnectUpdate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove();
  await act(async () => { confirmMove(); });
  expect(m.disconnectUpdate).toHaveBeenCalledOnce();
  const yearPath = 'config/studentMoveLocks/2026';
  const firstLeaves = Object.keys(m.disconnectUpdate.mock.calls[0][1]).map(path => `${yearPath}/${path}`);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(m.patch).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '이전' })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: '이전' }));
  expect(screen.getByRole('button', { name: '취소' })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: '이동 내용 확인' }));
  await act(async () => { confirmMove(); });
  const secondLeaves = Object.keys(m.disconnectUpdate.mock.calls[1][1]).map(path => `${yearPath}/${path}`);
  expect(secondLeaves).not.toEqual(firstLeaves);
  const previousCancelCount = m.disconnectCancel.mock.calls.length;
  await act(async () => { first.resolve(); });
  expect(m.disconnectCancel.mock.calls.slice(previousCancelCount).map(([path]) => path).sort()).toEqual([...firstLeaves].sort());
  expect(m.disconnectCancel.mock.calls.every(([path]) => path !== yearPath)).toBe(true);
  expect(secondLeaves.every(path => !firstLeaves.includes(path))).toBe(true);
  expect(m.patch).not.toHaveBeenCalled();
  await act(async () => { second.resolve(); });
  expect(m.patch).toHaveBeenCalledOnce();
  expect(m.close).toHaveBeenCalledOnce();
});

it('pending 잠금의 연결 종료 취소 응답이 멈추면 PATCH 없이 15초 뒤 창을 닫을 수 있다', async () => {
  vi.useFakeTimers();
  const cancellation = deferred<void>();
  m.disconnectCancel.mockReturnValueOnce(cancellation.promise).mockReturnValueOnce(cancellation.promise);
  render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove();
  await act(async () => { confirmMove(); });
  expect(m.disconnectCancel).toHaveBeenCalledTimes(2);
  const yearPath = 'config/studentMoveLocks/2026';
  const operationLeaves = Object.keys(m.disconnectUpdate.mock.calls[0][1]).map(path => `${yearPath}/${path}`);
  expect(m.disconnectCancel.mock.calls.map(([path]) => path).sort()).toEqual([...operationLeaves].sort());
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(m.patch).not.toHaveBeenCalled();
  expect(m.lock).toBeNull();
  expect(screen.getByRole('button', { name: '이전' })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: '이전' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(m.close).toHaveBeenCalledOnce();
  await act(async () => { cancellation.resolve(); });
  expect(m.patch).not.toHaveBeenCalled();
  expect(m.disconnectCancel.mock.calls.every(([path]) => operationLeaves.includes(path))).toBe(true);
});

it('거절된 요청의 잠금 정리가 멈춰도 5초 뒤 저장 중 상태와 닫기 잠금을 해제한다', async () => {
  vi.useFakeTimers();
  const cleanupResult = deferred<{ committed: boolean; value: unknown }>();
  const applyTransaction = m.transact.getMockImplementation()!;
  m.transact.mockImplementation((change: (current: unknown) => unknown, input: { timeoutMs?: number }) =>
    input.timeoutMs === 5000 ? cleanupResult.promise : applyTransaction(change, input));
  m.patch.mockResolvedValue({ status: 'rejected' });
  render(<MoveStudentModal target={target} onClose={m.close} />);
  reviewMove();
  await act(async () => { confirmMove(); });
  expect(m.patch).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: '이동 중...' })).toHaveProperty('disabled', true);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByRole('button', { name: '이전' })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: '이전' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(m.close).toHaveBeenCalledOnce();
  await act(async () => { cleanupResult.resolve({ committed: true, value: null }); });
  expect(m.patch).toHaveBeenCalledOnce();
  expect(m.dispatch).not.toHaveBeenCalled();
});
