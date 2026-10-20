/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  set: vi.fn(),
  saveCheck: vi.fn(),
  oneTap: false,
  push: vi.fn(),
  onValue: vi.fn(),
  state: { current: null as unknown },
  stats: null as null | { present: number; absent: number; rate: number },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('week=8-0'),
}));

vi.mock('@/lib/attendanceSave', () => ({ saveAttendanceCell: mocks.set, AttendanceSaveError: class extends Error {} }));
vi.mock('@/lib/attendanceCheckSave', () => ({ saveAttendanceCheck: mocks.saveCheck }));
vi.mock('@/lib/longAbsentReturn', () => ({ returnLongAbsentStudent: vi.fn() }));
vi.mock('@/lib/teacherMessageSave', () => ({ TeacherMessageSaveError: class extends Error {}, saveTeacherMessage: (year: number, ck: string, _id: string, payload: unknown) => mocks.push({ path: `suggestions/${year}/${ck}` }, payload) }));

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
    calcStats: () => mocks.stats ?? ({ present: 1, absent: 0, rate: 100 }),
  };
});

vi.mock('@/utils/attendanceEntry', () => ({
  buildAttendanceEntry: ({ userRole }: { userRole?: { role?: string } }, { pickedWeekKey }: { pickedWeekKey?: string }) => {
    const currentWeek = mocks.oneTap ? { key: '0-0', label: '10월 25일' } : { key: '8-0', label: '9월 6일' };
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

// 화면 단위 검사는 폼 훅을 격리한다. 실제 세션 보존·저장 경합은 TeacherDraft.render.test.tsx에서 검증한다.
vi.mock('@/hooks/useTeacherDraft', async () => {
  const { useState } = await import('react');
  return { useTeacherDraft: () => {
    const [current, setCurrent] = useState({ studentId: '', text: '' });
    const [saving, setSaving] = useState(false);
    const [submission, setSubmission] = useState<import('@/store/AppContext').TeacherSubmission | undefined>();
    return { current, saving, submission, setSubmission, setSaving, setStudentId: (studentId: string) => setCurrent(v => ({ ...v, studentId })),
      setText: (text: string) => setCurrent(v => ({ ...v, text })), clearSaved: () => setCurrent({ studentId: '', text: '' }) };
  } };
});

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
  it('교사는 같은 로그인에서 확인된 마지막 접수 대상·시각을 본문 없이 확인한다', () => {
    mocks.state.current = { ...teacherState(), teacherReceipts: { '2026/1-1-1/note': { id: 'confirmed', studentName: '홍길동', receivedAt: 1792141200000 } } };
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '특이사항' }));
    const receipt = screen.getByRole('status', { name: '특이사항 접수 확인' });
    expect(receipt.textContent).toContain('마지막으로 접수된 특이사항');
    expect(receipt.textContent).toContain('홍길동'); expect(receipt.textContent).toContain('접수 확인 시각');
    expect(receipt.textContent).toContain('새로고침하면 사라집니다');
    expect(mocks.onValue).not.toHaveBeenCalled();
  });
  it('이전 접수 기록과 현재 작성 중인 초안은 별개로 표시한다', () => {
    mocks.state.current = { ...teacherState(), teacherReceipts: { '2026/1-1-1/note': { id: 'previous', studentName: '이전학생', receivedAt: 1792141200000 } } };
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '특이사항' }));
    fireEvent.change(screen.getByRole('textbox', { name: '특이사항' }), { target: { value: '아직 접수하지 않은 새 내용' } });
    const receipt = screen.getByRole('status', { name: '특이사항 접수 확인' });
    expect(receipt.textContent).toContain('현재 작성 중인 내용과는 별개');
    expect(receipt.textContent).not.toContain('아직 접수하지 않은 새 내용');
  });
  it.each(['admin', 'teacher'] as const)('%s의 장결 목록은 관리자만 복귀 확인창을 열 수 있다', role => {
    mocks.state.current = { ...teacherState(), userRole: { role }, classData: { '1-1-1': { students: [{ id: 'long', name: '합성 장결 학생', jang: true }] } } };
    render(<AttendanceTab />);
    fireEvent.click(screen.getByText('장결자 1명'));
    if (role === 'teacher') expect(screen.queryByRole('button', { name: '합성 장결 학생 일반 명단 복귀' })).toBeNull();
    else {
      fireEvent.click(screen.getByRole('button', { name: '합성 장결 학생 일반 명단 복귀' }));
      expect(screen.getByRole('dialog', { name: '일반 명단 복귀' })).toBeTruthy();
    }
  });
  beforeEach(() => {
    mocks.state.current = teacherState();
    mocks.stats = null;
    mocks.oneTap = false;
    mocks.saveCheck.mockReset(); mocks.saveCheck.mockResolvedValue(undefined);
    mocks.dispatch.mockReset();
    mocks.ref.mockClear();
    mocks.set.mockReset();
    mocks.set.mockResolvedValue(undefined);
    mocks.push.mockReset();
    mocks.push.mockResolvedValue(undefined);
    mocks.onValue.mockReset();
  });

  afterEach(() => cleanup());

  it('무기록 평균은 0%가 아닌 입력 기록 없음으로 구분한다', () => {
    mocks.stats = { present: 0, absent: 0, rate: 0 };
    mocks.state.current = { ...teacherState(), userRole: { role: 'admin' } };
    render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '출석부' }));
    const label = screen.getByText('평균 출석률');
    expect(label.parentElement?.textContent).toContain('—');
    expect(label.parentElement?.textContent).toContain('입력 기록 없음');
    expect(label.parentElement?.textContent).not.toContain('0%');
  });

  it('작성 도중 학생이 이동하면 내용은 보존하고 학생 재선택 전 등록을 막는다', () => {
    const { rerender } = render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('tab', { name: '특이사항' }));
    fireEvent.change(screen.getByLabelText(/학생/), { target: { value: 'student-1' } });
    fireEvent.change(screen.getByRole('textbox', { name: '특이사항' }), { target: { value: '보존할 상담 내용' } });
    mocks.state.current = { ...teacherState(), classData: { '1-1-1': { students: [] } } };
    rerender(<AttendanceTab />);
    expect(screen.getByRole('alert').textContent).toContain('현재 반에 없습니다');
    expect((screen.getByRole('button', { name: '등록하기' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: '특이사항' }) as HTMLTextAreaElement).value).toBe('보존할 상담 내용');
    expect(mocks.push).not.toHaveBeenCalled();
  });

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

  it('새 주일은 처음에 미시작·중립 버튼이고 한 번 누르면 출석을 즉시 저장한다', async () => {
    mocks.oneTap = true;
    mocks.state.current = { ...teacherState(), months: [{ month: 10, sundays: [25] }], attData: {} };
    const { container } = render(<AttendanceTab />);
    expect(screen.getByText('미시작')).toBeTruthy();
    expect(container.querySelector('.week-summary-card.red')).toBeNull();
    expect(container.querySelector('.row-x')).toBeNull();
    expect(screen.queryByRole('button', { name: /홍길동 결석/ })).toBeNull();
    const button = screen.getByRole('button', { name: '홍길동 출석으로 기록' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    await waitFor(() => expect(mocks.saveCheck).toHaveBeenCalledWith(expect.objectContaining({
      year: 2026, target: { ck: '1-1-1', sid: 'student-1', k: '0-0' }, expected: '', value: 'O', none: false,
    }), expect.any(Function)));
    expect(mocks.set).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^완료$/ })).toBeNull();
  });

  it('새 주일의 X는 미체크 중립으로 표시하고 출석 취소도 X로 저장한다', async () => {
    mocks.oneTap = true;
    const source = { ...teacherState(), months: [{ month: 10, sundays: [25] }], attData: { '1-1-1': { 'student-1': { '0-0': 'X' as const } } } };
    mocks.state.current = source;
    const { container, rerender } = render(<AttendanceTab />);
    expect(screen.getByRole('button', { name: '홍길동 출석으로 기록' }).getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.row-x')).toBeNull();
    expect(screen.getByText('미체크')).toBeTruthy();
    mocks.state.current = { ...source, attData: { '1-1-1': { 'student-1': { '0-0': 'O' } } } };
    rerender(<AttendanceTab />);
    fireEvent.click(screen.getByRole('button', { name: '홍길동 출석 현재 선택됨, 다시 누르면 출석 취소' }));
    await waitFor(() => expect(mocks.saveCheck).toHaveBeenCalledWith(expect.objectContaining({ expected: 'O', value: 'X' }), expect.any(Function)));
  });

  it('전원 결석은 확인창에서만 기록하고 출석 학생이 있으면 버튼을 막는다', async () => {
    mocks.oneTap = true;
    const source = { ...teacherState(), months: [{ month: 10, sundays: [25] }], attData: {} };
    mocks.state.current = source;
    const { rerender } = render(<AttendanceTab />);
    fireEvent.click(screen.getByRole('button', { name: '오늘 출석 학생 없음' }));
    expect(screen.getByRole('dialog', { name: '오늘 출석 학생 없음' })).toBeTruthy();
    expect(mocks.saveCheck).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '출석 0명으로 기록' }));
    await waitFor(() => expect(mocks.saveCheck).toHaveBeenCalledWith(expect.objectContaining({
      target: { ck: '1-1-1', sid: '', k: '0-0' }, none: true,
    }), expect.any(Function)));
    mocks.state.current = { ...source, attData: { '1-1-1': { 'student-1': { '0-0': 'O' } } } };
    rerender(<AttendanceTab />);
    expect((screen.getByRole('button', { name: '오늘 출석 학생 없음' }) as HTMLButtonElement).disabled).toBe(true);
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
