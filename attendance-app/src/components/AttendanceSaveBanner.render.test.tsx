/** @vitest-environment jsdom */
import { useCallback, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AttendanceSaveBanner, {
  ATTENDANCE_SAVED_FEEDBACK_MS,
  type AttendanceSaveFeedback,
} from './AttendanceSaveBanner';

const target = { ck: '1-1-1', sid: 'student-1', k: '8-0' };

function SavedFeedbackHarness() {
  const [feedback, setFeedback] = useState<AttendanceSaveFeedback | null>({
    status: 'saved',
    sid: target.sid,
    studentName: '테스트 학생',
    target,
    value: 'O',
    savedAt: 100,
  });
  const dismissSaved = useCallback((savedAt: number) => {
    setFeedback(current => current?.status === 'saved' && current.savedAt === savedAt ? null : current);
  }, []);

  return (
    <AttendanceSaveBanner
      feedback={feedback}
      visible
      onDismissSaved={dismissSaved}
      onRetry={() => {}}
    />
  );
}

describe('AttendanceSaveBanner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('전원 결석 저장을 출석 저장으로 잘못 안내하지 않는다', () => {
    render(<AttendanceSaveBanner feedback={{ status: 'saved', target: { ...target, sid: '' }, sid: '', studentName: '반 전체', value: 'X', savedAt: 1 }} visible onDismissSaved={() => {}} onRetry={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('일반 학생 전원 결석이 저장되었습니다.');
  });

  it('저장 성공을 알린 뒤 2초 후 화면에서 없앤다', () => {
    render(<SavedFeedbackHarness />);
    expect(screen.getByRole('status').textContent).toContain('저장되었습니다');

    act(() => vi.advanceTimersByTime(ATTENDANCE_SAVED_FEEDBACK_MS - 1));
    expect(screen.queryByRole('status')).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('저장 실패와 재시도는 시간이 지나도 유지한다', () => {
    const retry = vi.fn();
    const feedback: AttendanceSaveFeedback = {
      status: 'error',
      sid: target.sid,
      studentName: '테스트 학생',
      target,
      value: 'X',
    };
    render(
      <AttendanceSaveBanner
        feedback={feedback}
        visible
        onDismissSaved={() => {}}
        onRetry={retry}
      />,
    );

    act(() => vi.advanceTimersByTime(ATTENDANCE_SAVED_FEEDBACK_MS * 2));
    fireEvent.click(screen.getByRole('button', { name: '재시도' }));

    expect(screen.queryByRole('status')).not.toBeNull();
    expect(retry).toHaveBeenCalledWith(feedback);
  });

  it('새 성공 안내가 나타나면 이전 안내의 타이머를 취소한다', () => {
    const dismissSaved = vi.fn();
    const first: AttendanceSaveFeedback = {
      status: 'saved', sid: 'student-1', studentName: '첫째', target, value: 'O', savedAt: 100,
    };
    const second: AttendanceSaveFeedback = {
      status: 'saved', sid: 'student-2', studentName: '둘째',
      target: { ...target, sid: 'student-2' }, value: 'O', savedAt: 200,
    };
    const { rerender } = render(
      <AttendanceSaveBanner feedback={first} visible onDismissSaved={dismissSaved} onRetry={() => {}} />,
    );

    act(() => vi.advanceTimersByTime(ATTENDANCE_SAVED_FEEDBACK_MS - 100));
    rerender(
      <AttendanceSaveBanner feedback={second} visible onDismissSaved={dismissSaved} onRetry={() => {}} />,
    );
    act(() => vi.advanceTimersByTime(100));
    expect(dismissSaved).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(ATTENDANCE_SAVED_FEEDBACK_MS - 100));
    expect(dismissSaved).toHaveBeenCalledTimes(1);
    expect(dismissSaved).toHaveBeenCalledWith(200);
  });
});

it('결과 불명 안내와 재시도는 2초 후에도 남는다', () => {
  vi.useFakeTimers();
  const feedback: AttendanceSaveFeedback = { status: 'unknown', sid: target.sid, target, studentName: '가상 학생', value: 'X', targetLabel: '2026년 1부 1학년 1반 · 9월 6일' };
  render(<AttendanceSaveBanner feedback={feedback} visible onDismissSaved={() => {}} onRetry={() => {}} />);
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByRole('status').textContent).toContain('확인 필요');
  expect(screen.getByRole('status').textContent).toContain('9월 6일 · 결석');
  expect(screen.getByRole('button', { name: '재시도' })).toBeDefined();
  cleanup(); vi.useRealTimers();
});
