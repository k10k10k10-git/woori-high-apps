/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ state: null as AppState | null }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state }) }));
import { initialState, reducer } from '@/store/AppContext';
import AttendanceSaveStatus from './AttendanceSaveStatus';
const at = Date.parse('2026-10-05T01:30:00Z');
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('성공 시간이 2초 뒤에도 유지되고 후속 저장·실패·결과 불명과 구분된다', () => {
  vi.useFakeTimers();
  m.state = reducer(initialState, { type: 'SET_SAVE_STATUS', payload: 'saved', savedAt: at });
  const { rerender } = render(<AttendanceSaveStatus />);
  expect(screen.getByText(/마지막 확인/).textContent).toContain('10:30:00');
  act(() => vi.advanceTimersByTime(3000));
  expect(m.state.lastAttendanceSavedAt).toBe(at);
  for (const [status, text] of [['saving', '출석 저장 중'], ['error', '출석 저장 실패'], ['unknown', '출석 저장 확인 필요']] as const) {
    m.state = reducer(m.state, { type: 'SET_SAVE_STATUS', payload: status });
    rerender(<AttendanceSaveStatus />);
    expect(screen.getByText(text)).toBeDefined();
    expect(screen.getByText(/마지막 확인/).textContent).toContain('10:30:00');
  }
  m.state = reducer(m.state, { type: 'SET_SAVE_STATUS', payload: 'saved', savedAt: at + 60000 });
  rerender(<AttendanceSaveStatus />);
  expect(screen.getByText(/마지막 확인/).textContent).toContain('10:31:00');
  expect(screen.queryByText(/입력 완료/)).toBeNull();
});
it('계정·연도 변경은 이전 세션 저장 시각을 비운다', () => {
  const saved = reducer(initialState, { type: 'SET_SAVE_STATUS', payload: 'saved', savedAt: at });
  expect(reducer(saved, { type: 'SET_YEAR', payload: 2027 }).lastAttendanceSavedAt).toBeNull();
  expect(reducer(saved, { type: 'SET_USER_ROLE', payload: null }).lastAttendanceSavedAt).toBeNull();
});
