/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ save: vi.fn(), state: null as AppState | null, dispatch: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: {} }));
vi.mock('@/lib/attendanceSave', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/attendanceSave')>(), saveAttendanceCell: m.save }));
vi.mock('@/store/AppContext', async importOriginal => ({ ...await importOriginal<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state, dispatch: m.dispatch, getState: () => m.state }) }));
import { initialState, reducer } from '@/store/AppContext';
import { AttendanceSaveError } from '@/lib/attendanceSave';
import { useAttendanceSave } from './useAttendanceSave';
const target = { ck: '1-1-1', sid: 's', k: '8-0' };
beforeEach(() => { vi.clearAllMocks(); m.dispatch.mockReset(); m.state = { ...initialState, curYear: 2026, attData: {}, classData: {} }; });
afterEach(cleanup);
it('실패 뒤 화면 값이 바뀌어도 재시도는 원래 사전값을 유지한다', async () => {
  m.save.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const { result, rerender } = renderHook(useAttendanceSave);
  await act(async () => { await result.current.save(target, 'O'); });
  const failure = result.current.feedback!;
  m.state = { ...m.state!, attData: { '1-1-1': { s: { '8-0': 'X' } } } }; rerender();
  await act(async () => { await result.current.save(target, 'O', failure); });
  expect(m.save.mock.calls[1][0]).toMatchObject({ expected: '', value: 'O' });
});
it('충돌은 자동 덮어쓰기 재시도 대신 현재 기록의 새 선택을 요구한다', async () => {
  m.save.mockRejectedValue(new AttendanceSaveError('conflict', '새로 선택'));
  const { result } = renderHook(useAttendanceSave);
  await act(async () => { await result.current.save(target, 'O'); });
  expect(result.current.feedback).toMatchObject({ status: 'error', retryable: false, message: '새로 선택' });
});
it('연도 전환 후 이전 요청의 응답과 재시도를 현재 화면에 적용하지 않는다', async () => {
  let finish!: () => void;
  m.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(useAttendanceSave);
  let saving!: Promise<void>;
  act(() => { saving = result.current.save(target, 'O'); });
  const old = result.current.feedback!;
  m.state = { ...m.state!, curYear: 2027, dataRevision: m.state!.dataRevision + 1 }; rerender();
  expect(m.save.mock.calls[0][1]()).toBe(false);
  expect(result.current.feedback).toBeNull();
  await act(async () => { finish(); await saving; });
  await act(async () => { await result.current.save(target, 'O', old); });
  expect(m.save).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(result.current.pending).toBe(false));
  expect(result.current.feedback).toBeNull();
});

it('연속 저장 중 이전 성공 안내를 닫아도 진행 상태는 유지한다', async () => {
  m.save.mockResolvedValueOnce(undefined);
  const { result } = renderHook(useAttendanceSave);
  await act(async () => { await result.current.save(target, 'O'); });
  const saved = result.current.feedback!;
  expect(saved.status).toBe('saved');
  let finish!: () => void;
  m.save.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let saving!: Promise<void>;
  act(() => { saving = result.current.save({ ...target, sid: 'second' }, 'X'); });
  act(() => { if (saved.status === 'saved') result.current.dismissSaved(saved.savedAt); });
  expect(result.current.feedback?.status).toBe('saving');
  expect(result.current.pending).toBe(true);
  await act(async () => { finish(); await saving; });
  expect(result.current.feedback).toMatchObject({ status: 'saved', sid: 'second' });
});
it('결과 불명은 실패와 구분하고 재시도 시 사전값을 보존한다', async () => {
  m.save.mockRejectedValueOnce(new AttendanceSaveError('unknown', '결과 확인 필요')).mockResolvedValueOnce(undefined);
  const { result } = renderHook(useAttendanceSave);
  await act(async () => { await result.current.save(target, 'X'); });
  const unknown = result.current.feedback!;
  expect(unknown).toMatchObject({ status: 'unknown', retryable: true });
  expect(m.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'SET_SAVE_STATUS', payload: 'unknown' }));
  await act(async () => { await result.current.save(target, 'X', unknown); });
  expect(m.save.mock.calls[1][0]).toMatchObject({ expected: '', value: 'X' });
  expect(m.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ payload: 'saved', savedAt: expect.any(Number) }));
});
it('명시적 저장 거절은 실패로 표시한다', async () => {
  m.save.mockRejectedValueOnce(new AttendanceSaveError('unavailable', '거절됨'));
  const { result } = renderHook(useAttendanceSave);
  await act(async () => { await result.current.save(target, 'O'); });
  expect(result.current.feedback?.status).toBe('error');
  expect(m.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'SET_SAVE_STATUS', payload: 'error' }));
});
it.each(['saved', 'error'] as const)('화면 이동 후에도 전역 저장 결과를 %s로 갱신한다', async status => {
  let finish!: () => void;
  m.save.mockImplementation(() => new Promise<void>((resolve, reject) => { finish = () => status === 'saved' ? resolve() : reject(new Error('offline')); }));
  const { result, unmount } = renderHook(useAttendanceSave);
  let saving!: Promise<void>;
  act(() => { saving = result.current.save(target, 'O'); });
  unmount();
  await act(async () => { finish(); await saving; });
  expect(m.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ payload: status, revision: m.state!.dataRevision, feedback: expect.objectContaining({ target, expected: '', value: 'O' }) }));
});
it('재진입 시 세션에 보관한 결과 불명 요청을 복원한다', () => {
  m.state = { ...m.state!, saveStatus: 'unknown', attendanceFeedback: { sid: 's', studentName: '가상 학생', target, value: 'O', expected: '', scope: '2026/0', status: 'unknown', retryable: true } };
  const { result } = renderHook(useAttendanceSave);
  expect(result.current.feedback).toMatchObject({ status: 'unknown', expected: '', target });
});
it('저장 도중 재진입한 화면도 완료 결과로 전환하고 성공 안내만 닫을 수 있다', async () => {
  m.state = { ...m.state!, userRole: { role: 'admin' } };
  m.dispatch.mockImplementation(action => { m.state = reducer(m.state!, action); });
  let finish!: () => void;
  m.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const first = renderHook(useAttendanceSave);
  let saving!: Promise<void>;
  act(() => { saving = first.result.current.save(target, 'O'); });
  first.unmount();
  const next = renderHook(useAttendanceSave);
  expect(next.result.current.feedback?.status).toBe('saving');
  await act(async () => { finish(); await saving; });
  next.rerender();
  expect(next.result.current.feedback?.status).toBe('saved');
  expect(next.result.current.pending).toBe(false);
  const saved = next.result.current.feedback!;
  act(() => { if (saved.status === 'saved') next.result.current.dismissSaved(saved.savedAt); });
  expect(next.result.current.feedback).toBeNull();
});
