/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock('@/lib/db', () => ({
  db: { name: 'fixture-db' },
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  get: vi.fn(() => new Promise(() => {})),
}));

vi.mock('@/store/AppContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/store/AppContext')>();
  return {
    ...actual,
    useApp: () => ({ state: mocks.state.current as AppState, dispatch: mocks.dispatch }),
  };
});

import { initialState } from '@/store/AppContext';
import AttModal from './AttModal';
import HistoryModal from './HistoryModal';

function fixtureState(): AppState {
  return {
    ...initialState,
    userRole: { role: 'teacher', part: '1', grade: '1', class: '1', name: '김교사' },
    curYear: 2026,
    months: [{ month: 9, sundays: [6] }],
    classData: {
      '1-1-1': {
        teacher: '김교사',
        students: [{ id: 'student-1', num: 1, name: '홍길동' }],
      },
    },
    attData: {
      '1-1-1': {
        'student-1': { '0-0': 'O' },
      },
    },
  };
}

describe('출석 모달 키보드 접근', () => {
  beforeEach(() => {
    mocks.state.current = fixtureState();
    mocks.dispatch.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('출석 수정 모달이 첫 선택지로 초점을 옮기고 ESC로 닫힌다', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <AttModal
        target={{ ck: '1-1-1', sid: 'student-1', k: '0-0' }}
        currentVal="X"
        onSelect={() => {}}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '홍길동 9월 6일 출석 입력' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.classList.contains('teacher-attendance-modal')).toBe(true);
    const currentOption = screen.getByRole('button', { name: '홍길동 결석 처리' });
    const closeButton = screen.getByRole('button', { name: '닫기' });
    const clearButton = screen.getByRole('button', { name: '출석 상태 초기화' });
    await waitFor(() => expect(document.activeElement).toBe(currentOption));
    expect(currentOption.getAttribute('aria-pressed')).toBe('true');

    clearButton.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(clearButton);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('출석 이력 모달이 닫기 버튼으로 초점을 옮기고 ESC로 닫힌다', async () => {
    vi.useFakeTimers();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <HistoryModal sid="student-1" curCk="1-1-1" onClose={onClose} />,
    );

    const dialog = screen.getByRole('dialog', { name: '홍길동 출석 이력' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.classList.contains('teacher-attendance-modal')).toBe(true);
    const closeButton = screen.getByRole('button', { name: '닫기' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(210));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
