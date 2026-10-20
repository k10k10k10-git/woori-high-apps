'use client';

import { useEffect } from 'react';
import type { AttEditTarget, AttValue, Student } from '@/types';

export const ATTENDANCE_SAVED_FEEDBACK_MS = 2000;

type FeedbackBase = {
  targetLabel?: string;
  sid: string;
  studentName: string;
  student?: Student;
  target: AttEditTarget;
  value: AttValue;
  message?: string;
  expected?: AttValue;
  scope?: string;
  retryable?: boolean;
};

export type AttendanceSaveFeedback = FeedbackBase & (
  | { status: 'saving' | 'error' | 'unknown' }
  | { status: 'saved'; savedAt: number }
);

type Props = {
  feedback: AttendanceSaveFeedback | null;
  visible: boolean;
  onDismissSaved: (savedAt: number) => void;
  onRetry: (feedback: AttendanceSaveFeedback) => void;
};

export default function AttendanceSaveBanner({ feedback, visible, onDismissSaved, onRetry }: Props) {
  const savedAt = feedback?.status === 'saved' ? feedback.savedAt : null;
  const none = feedback?.target.sid === '';

  useEffect(() => {
    if (savedAt === null) return;

    const timer = window.setTimeout(() => onDismissSaved(savedAt), ATTENDANCE_SAVED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [savedAt, onDismissSaved]);

  if (!feedback || !visible) return null;

  return (
    <div className={`attendance-save-banner ${feedback.status}`} role="status" aria-live="polite" aria-atomic="true">
      <span>
        {feedback.targetLabel && <small className="attendance-save-target">{feedback.targetLabel} · {none ? '일반 학생 출석 0명 확인' : feedback.value === 'O' ? '출석' : feedback.value === 'X' ? '결석' : '미입력'}</small>}
        {feedback.status === 'saving' && `${none ? '일반 학생 전원 결석을' : `${feedback.studentName} 출석을`} 저장하고 있습니다.`}
        {feedback.status === 'saved' && `${none ? '일반 학생 전원 결석이' : `${feedback.studentName} 출석이`} 저장되었습니다.`}
        {feedback.status === 'unknown' && `확인 필요: ${feedback.message ?? '저장 결과를 확인하지 못했습니다. 재시도하면 최신 값을 먼저 확인합니다.'}`}
        {feedback.status === 'error' && (feedback.message ?? `${feedback.studentName} 출석을 저장하지 못했습니다.`)}
      </span>
      {(feedback.status === 'error' || feedback.status === 'unknown') && feedback.retryable !== false && (
        <button type="button" onClick={() => onRetry(feedback)}>재시도</button>
      )}
    </div>
  );
}
