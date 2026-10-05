/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  set: vi.fn(),
  push: vi.fn(),
  onValue: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('week=8-0'),
}));

vi.mock('@/lib/attendanceSave', () => ({ saveAttendanceCell: mocks.set, AttendanceSaveError: class extends Error {} }));

vi.mock('@/lib/db', () => ({
  db: { name: 'fixture-db' },
  ref: mocks.ref,
  set: mocks.set,
  push: mocks.push,
  onValue: mocks.onValue,
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
  buildAttendanceEntry: ({ userRole }: { userRole?: { role?: string } }, { pickedWeekKey }: { pickedWeekKey?: string }) => {
    const currentWeek = { key: '8-0', label: '9월 6일' };
    return {
      editableWeeks: userRole?.role === 'admin'
        ? [{ key: '7-0', label: '8월 30일' }, currentWeek]
        : [currentWeek],
      selectedWeek: pickedWeekKey === '7-0' ? { key: '7-0', label: '8월 30일' } : currentWeek,
    };
  },
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
    mocks.push.mockReset();
    mocks.push.mockResolvedValue(undefined);
    mocks.onValue.mockReset();
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
      expect(mocks.set).toHaveBeenCalledWith(
        { year: 2026, target: { ck: '1-1-1', sid: 'student-1', k: '8-0' }, expected: 'O', value: '' },
        expect.any(Function),
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
    expect(container.querySelector('.attendance-week-icon')).not.toBeNull();
    expect(container.querySelector('.attendance-week-field')).not.toBeNull();
    unmount();

    mocks.state.current = {
      ...teacherState(),
      userRole: { role: 'admin', name: '관리자' },
    };
    const adminRender = render(<AttendanceTab />);
    expect(adminRender.container.querySelector('.teacher-attendance')).toBeNull();
    expect(adminRender.container.querySelector('.attendance-week-icon')).toBeNull();
    expect(adminRender.container.querySelector('.attendance-week-field')).toBeNull();
    expect(screen.getByLabelText('출석 날짜')).not.toBeNull();
  });

  it('서브탭과 활성 패널을 연결하고 화살표 키로 다음 패널에 초점을 옮긴다', async () => {
    render(<AttendanceTab />);

    const checkTab = screen.getByRole('tab', { name: '출석 체크' });
    const tableTab = screen.getByRole('tab', { name: '출석부' });
    expect(checkTab.getAttribute('aria-controls')).toBe('attendance-panel-check');
    expect(tableTab.hasAttribute('aria-controls')).toBe(false);
    expect(screen.getByRole('tabpanel', { name: '출석 체크' }).id).toBe('attendance-panel-check');

    fireEvent.keyDown(checkTab, { key: 'ArrowRight' });
    expect(tableTab.getAttribute('aria-selected')).toBe('true');
    expect(tableTab.getAttribute('aria-controls')).toBe('attendance-panel-table');
    expect(screen.getByRole('tabpanel', { name: '출석부' }).id).toBe('attendance-panel-table');
    await waitFor(() => expect(document.activeElement).toBe(tableTab));
  });

  it('특이사항에 학생을 선택해 등록할 수 있고 반 전체 기록도 허용한다', async () => {
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '특이사항' }));

    const textbox = screen.getByRole('textbox', { name: '특이사항' });
    const submit = screen.getByRole('button', { name: '등록하기' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/학생/), { target: { value: 'student-1' } });
    fireEvent.change(textbox, { target: { value: '화면 제안' } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(
      { path: 'suggestions/2026/1-1-1' },
      expect.objectContaining({ kind: 'note', studentId: 'student-1', studentName: '홍길동' }),
    ));
  });

  it('교사가 학생과 사유를 선택해 심방을 요청한다', async () => {
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '심방 요청' }));

    const submit = screen.getByRole('button', { name: '심방 요청하기' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('학생'), { target: { value: 'student-1' } });
    fireEvent.change(screen.getByRole('textbox', { name: '요청 이유' }), { target: { value: '연락이 필요합니다.' } });
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(
      { path: 'suggestions/2026/1-1-1' },
      expect.objectContaining({ kind: 'visit', studentId: 'student-1', studentName: '홍길동', status: 'open' }),
    ));
  });

  it('출석표의 행과 열 헤더 관계를 제공한다', () => {
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '출석부' }));

    expect(screen.getByRole('columnheader', { name: '순' }).getAttribute('scope')).toBe('col');
    expect(screen.getByRole('columnheader', { name: '9월' }).getAttribute('scope')).toBe('colgroup');
    expect(screen.getByRole('rowheader', { name: '홍길동' }).getAttribute('scope')).toBe('row');
  });

  it('내보내기 메뉴의 열림 상태를 알리고 ESC로 닫아 초점을 복귀한다', () => {
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '출석부' }));

    const exportButton = screen.getByRole('button', { name: '출석부 내보내기 메뉴 열기' });
    expect(exportButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(exportButton);
    expect(exportButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'CSV 다운로드' })).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(exportButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(exportButton);
  });

  it('관리자 특이사항 구독 실패를 빈 목록과 구분한다', async () => {
    mocks.state.current = {
      ...teacherState(),
      userRole: { role: 'admin', name: '관리자' },
    };
    mocks.onValue.mockImplementation((_query, _next, onError) => onError?.(new Error('권한 없음')));

    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '특이사항' }));

    expect((await screen.findByRole('alert')).textContent).toContain('특이사항을 불러오지 못했습니다');
    expect(screen.queryByText('등록된 특이사항이 없습니다.')).toBeNull();
  });

  it('관리자는 최근 범위 밖 날짜도 기존처럼 수정할 수 있다', () => {
    mocks.state.current = {
      ...teacherState(),
      userRole: { role: 'admin', name: '관리자' },
    };

    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '출석부' }));

    expect(screen.getByRole('button', {
      name: '홍길동 8월 30일 출석 수정, 현재 결석',
    })).not.toBeNull();
  });
});

it('같은 학생 ID라도 반을 바꾸면 이전 반의 행 저장 표시를 붙이지 않는다', async () => {
  mocks.state.current = teacherState(); mocks.set.mockResolvedValue(undefined);
  const { container, rerender } = render(<AttendanceTab />);
  fireEvent.click(screen.getByRole('button', { name: /홍길동.*결석/ }));
  await waitFor(() => expect(container.querySelector('.attendance-row-save')?.textContent).toBe('저장됨'));
  const state = mocks.state.current as AppState;
  mocks.state.current = { ...state, curClass: '2', classData: { ...state.classData, '1-1-2': state.classData['1-1-1'] } };
  rerender(<AttendanceTab />);
  expect(container.querySelector('.attendance-row-save')).toBeNull();
});

it('날짜를 바꾸면 같은 학생의 이전 날짜 행 저장 표시를 붙이지 않는다', async () => {
  const state = teacherState(); mocks.state.current = { ...state, userRole: { role: 'admin' } };
  mocks.set.mockResolvedValue(undefined);
  const { container } = render(<AttendanceTab />);
  fireEvent.click(screen.getByRole('button', { name: /홍길동.*결석/ }));
  await waitFor(() => expect(container.querySelector('.attendance-row-save')?.textContent).toBe('저장됨'));
  fireEvent.change(screen.getByLabelText('출석 날짜'), { target: { value: '7-0' } });
  expect(container.querySelector('.attendance-row-save')).toBeNull();
});
