import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, reducer } from '@/store/AppContext';
import { watchCalendarYear } from '@/utils/yearRollover';

afterEach(() => vi.useRealTimers());

describe('KST 달력 연도 전환', () => {
  it('같은 달력연도의 화면 복귀는 연도 전환을 알리지 않는다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T03:00:00Z'));
    const changed = vi.fn();
    const watcher = watchCalendarYear(changed);
    watcher.check();
    expect(changed).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('실제 새해에는 직전 현재 연도 조회만 이동하고 수동 과거 연도 조회는 유지한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T14:59:59Z'));
    let current = { ...initialState, curYear: 2026 };
    let historical = { ...initialState, curYear: 2024 };
    const watcher = watchCalendarYear((previousYear, currentYear) => {
      const action = { type: 'CALENDAR_YEAR_CHANGED' as const, payload: { previousYear, currentYear } };
      current = reducer(current, action);
      historical = reducer(historical, action);
    });
    vi.advanceTimersByTime(2_000);
    expect(current.curYear).toBe(2027);
    expect(historical.curYear).toBe(2024);
    watcher.stop();
  });

  it('자정 뒤 재예약한 타이머도 cleanup에서 제거한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T14:59:59Z'));
    const watcher = watchCalendarYear(vi.fn());
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2_000);
    expect(vi.getTimerCount()).toBe(1);
    watcher.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('휴면 복귀와 예약 타이머가 같은 새해를 두 번 통지하지 않는다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T14:59:59Z'));
    const changed = vi.fn();
    const watcher = watchCalendarYear(changed);
    vi.setSystemTime(new Date('2026-12-31T15:00:00Z'));
    watcher.check();
    vi.advanceTimersByTime(2_000);
    expect(changed).toHaveBeenCalledExactlyOnceWith(2026, 2027);
    watcher.stop();
    watcher.check();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
