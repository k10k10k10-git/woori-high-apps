'use client';

import { useEffect } from 'react';
import type { AttEditTarget, AttValue } from '@/types';

export const ATTENDANCE_SAVED_FEEDBACK_MS = 2000;

type FeedbackBase = {
  sid: string;
  studentName: string;
  target: AttEditTarget;
  value: AttValue;
  message?: string;
  expected?: AttValue;
  scope?: string;
  retryable?: boolean;
};

export type AttendanceSaveFeedback = FeedbackBase & (
  | { status: 'saving' | 'error' }
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

  useEffect(() => {
    if (savedAt === null) return;

    const timer = window.setTimeout(() => onDismissSaved(savedAt), ATTENDANCE_SAVED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [savedAt, onDismissSaved]);

  if (!feedback || !visible) return null;

  return (
    <div className={`attendance-save-banner ${feedback.status}`} role="status" aria-live="polite" aria-atomic="true">
      <span>
        {feedback.status === 'saving' && `${feedback.studentName} 출석을 저장하고 있습니다.`}
        {feedback.status === 'saved' && `${feedback.studentName} 출석이 저장되었습니다.`}
        {feedback.status === 'error' && (feedback.message ?? `${feedback.studentName} 출석을 저장하지 못했습니다.`)}
      </span>
      {feedback.status === 'error' && feedback.retryable !== false && (
        <button type="button" onClick={() => onRetry(feedback)}>재시도</button>
      )}
    </div>
  );
}
