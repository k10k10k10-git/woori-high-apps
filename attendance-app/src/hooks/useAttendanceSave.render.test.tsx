/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ save: vi.fn(), state: null as AppState | null, dispatch: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: {} }));
vi.mock('@/lib/attendanceSave', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/attendanceSave')>(), saveAttendanceCell: m.save }));
vi.mock('@/store/AppContext', async importOriginal => ({ ...await importOriginal<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state, dispatch: m.dispatch }) }));
import { initialState } from '@/store/AppContext';
import { AttendanceSaveError } from '@/lib/attendanceSave';
import { useAttendanceSave } from './useAttendanceSave';
const target = { ck: '1-1-1', sid: 's', k: '8-0' };
beforeEach(() => { vi.clearAllMocks(); m.state = { ...initialState, curYear: 2026, attData: {}, classData: {} }; });
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
