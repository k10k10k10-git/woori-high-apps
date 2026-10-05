/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Toast from './Toast';
import { showToast } from '@/utils/toast';
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('동일 밀리초 알림은 각자의 수명으로 사라지고 접근 가능한 역할을 갖는다', () => {
  vi.useFakeTimers(); vi.setSystemTime(100);
  render(<Toast />);
  act(() => showToast('첫 저장', 'success'));
  act(() => { vi.advanceTimersByTime(500); vi.setSystemTime(100); showToast('두 번째 오류', 'error'); });
  expect(screen.getByRole('status').textContent).toBe('첫 저장');
  expect(screen.getByRole('alert').textContent).toBe('두 번째 오류');
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.queryByText('첫 저장')).toBeNull();
  expect(screen.getByText('두 번째 오류')).toBeTruthy();
  act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('alert')).toBeNull();
});
it('언마운트하면 구독과 모든 알림 타이머를 해제한다', () => {
  vi.useFakeTimers();
  const view = render(<Toast />);
  act(() => { showToast('합성 알림'); showToast('합성 알림2'); });
  expect(vi.getTimerCount()).toBe(2);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  showToast('언마운트 뒤 알림');
  expect(vi.getTimerCount()).toBe(0);
});
