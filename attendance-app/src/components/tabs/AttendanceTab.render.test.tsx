/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  set: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('week=8-0'),
}));

vi.mock('@/lib/db', () => ({
  db: { name: 'fixture-db' },
  ref: mocks.ref,
  set: mocks.set,
  push: vi.fn(),
  onValue: vi.fn(),
  off: vi.fn(),
}));

vi.mock('@/store/AppContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/store/AppContext')>();
  return {
    ...actual,
    useApp: () => ({ state: mocks.state.current as AppState, dispatch: mocks.dispatch }),
    calcStats: () => ({ present: 1, absent: 0, rate: 100 }),
  };
});

vi.mock('@/utils/attendanceEntry', () => ({
  buildAttendanceEntry: () => ({
    editableWeeks: [{ key: '8-0', label: '9월 6일' }],
    selectedWeek: { key: '8-0', label: '9월 6일' },
  }),
}));

import { initialState } from '@/store/AppContext';
import AttendanceTab from './AttendanceTab';

function teacherState(): AppState {
  return {
    ...initialState,
    fbReady: true,
    userRole: { role: 'teacher', part: '1', grade: '1', class: '1', name: '김교사' },
    curView: 'all',
    curYear: 2026,
    curPart: '1',
    curGrade: '1',
    curClass: '1',
    months: Array.from({ length: 9 }, (_, index) => ({
      month: index + 1,
      sundays: index === 7 ? [30] : index === 8 ? [6] : [],
    })),
    events: {},
    classData: {
      '1-1-1': {
        teacher: '김교사',
        students: [{ id: 'student-1', num: 1, name: '홍길동' }],
      },
    },
    attData: {
      '1-1-1': {
        'student-1': { '7-0': 'X', '8-0': 'O' },
      },
    },
  };
}

describe('AttendanceTab 교사 출석 입력', () => {
  beforeEach(() => {
    mocks.state.current = teacherState();
    mocks.dispatch.mockReset();
    mocks.ref.mockClear();
    mocks.set.mockReset();
    mocks.set.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('학생 이름을 실제 버튼으로 제공하고 출석 이력을 연다', () => {
    render(<AttendanceTab />);

    const historyButton = screen.getByRole('button', { name: '홍길동 출석 이력 보기' });
    expect(historyButton.tagName).toBe('BUTTON');

    fireEvent.click(historyButton);
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'OPEN_HISTORY_MODAL',
      payload: { sid: 'student-1', ck: '1-1-1' },
    });
  });

  it('빠른 출석 선택 상태를 알리고 같은 값을 다시 누르면 미입력으로 되돌린다', async () => {
    render(<AttendanceTab />);

    const presentButton = screen.getByRole('button', { name: /홍길동 출석 현재 선택됨/ });
    const absentButton = screen.getByRole('button', { name: '홍길동 결석으로 기록' });
    expect(presentButton.getAttribute('aria-pressed')).toBe('true');
    expect(absentButton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(presentButton);

    await waitFor(() => {
      expect(mocks.ref).toHaveBeenCalledWith(
        { name: 'fixture-db' },
        'attendance/2026/1-1-1/student-1/8-0',
      );
      expect(mocks.set).toHaveBeenCalledWith(
        { path: 'attendance/2026/1-1-1/student-1/8-0' },
        null,
      );
    });
  });

  it('출석부의 이름과 수정 가능 날짜도 실제 버튼으로 제공한다', () => {
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '출석부' }));

    const historyButton = screen.getByRole('button', { name: '홍길동 출석 이력 보기' });
    const editButton = screen.getByRole('button', {
      name: '홍길동 9월 6일 출석 수정, 현재 출석',
    });
    expect(historyButton.tagName).toBe('BUTTON');
    expect(editButton.tagName).toBe('BUTTON');

    mocks.dispatch.mockClear();
    fireEvent.click(editButton);
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'OPEN_ATT_MODAL',
      payload: { ck: '1-1-1', sid: 'student-1', k: '8-0' },
    });
  });

  it('교사는 최근 수정 범위 밖 날짜를 버튼으로 제공하지 않는다', () => {
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '출석부' }));

    expect(screen.queryByRole('button', {
      name: '홍길동 8월 30일 출석 수정, 현재 결석',
    })).toBeNull();
    const readonlyCell = screen.getByTitle('최근 4회 출석만 수정할 수 있습니다');
    expect(readonlyCell.tagName).toBe('TD');
    expect(readonlyCell.classList.contains('readonly')).toBe(true);
    expect(readonlyCell.querySelector('button')).toBeNull();
    expect(readonlyCell.textContent).toBe('X');
  });

  it('교사 역할에만 개편 스타일 범위를 붙인다', () => {
    const { container, unmount } = render(<AttendanceTab />);
    expect(container.querySelector('.teacher-attendance')).not.toBeNull();
    unmount();

    mocks.state.current = {
      ...teacherState(),
      userRole: { role: 'admin', name: '관리자' },
    };
    const adminRender = render(<AttendanceTab />);
    expect(adminRender.container.querySelector('.teacher-attendance')).toBeNull();
  });
});
